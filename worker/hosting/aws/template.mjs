// Pure template generation. No AWS SDK, subprocess, credentials or network.
const ref = name => ({ Ref: name });
const attr = (name, property) => ({ "Fn::GetAtt": [name, property] });
const sub = value => ({ "Fn::Sub": value });
export function infrastructureTemplate() {
  const tags = [{ Key: "Project", Value: "ComFlow" }, { Key: "Environment", Value: "review-pilot" }];
  const resource = (Type, Properties, extra = {}) => ({ Type, Properties, ...extra });
  const retain = { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" };
  const resources = {
    Network: resource("AWS::EC2::VPC", { CidrBlock: ref("VpcCidr"), EnableDnsSupport: true, EnableDnsHostnames: true, Tags: tags }),
    InternetGateway: resource("AWS::EC2::InternetGateway", { Tags: tags }),
    GatewayAttachment: resource("AWS::EC2::VPCGatewayAttachment", { VpcId: ref("Network"), InternetGatewayId: ref("InternetGateway") }),
    Subnet: resource("AWS::EC2::Subnet", { VpcId: ref("Network"), CidrBlock: ref("SubnetCidr"), AvailabilityZone: ref("AvailabilityZone"), MapPublicIpOnLaunch: false, Tags: tags }),
    RouteTable: resource("AWS::EC2::RouteTable", { VpcId: ref("Network"), Tags: tags }),
    InternetRoute: resource("AWS::EC2::Route", { RouteTableId: ref("RouteTable"), DestinationCidrBlock: "0.0.0.0/0", GatewayId: ref("InternetGateway") }, { DependsOn: "GatewayAttachment" }),
    SubnetRoute: resource("AWS::EC2::SubnetRouteTableAssociation", { SubnetId: ref("Subnet"), RouteTableId: ref("RouteTable") }),
    Firewall: resource("AWS::EC2::SecurityGroup", { GroupDescription: "ComFlow HTTPS only; administration through SSM", VpcId: ref("Network"), SecurityGroupIngress: [{ IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIp: "0.0.0.0/0" }], SecurityGroupEgress: [{ IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIp: "0.0.0.0/0" }], Tags: tags }),
    WorkerRepository: resource("AWS::ECR::Repository", { ImageTagMutability: "IMMUTABLE", EncryptionConfiguration: { EncryptionType: "AES256" }, Tags: tags }, retain),
    GatewayRepository: resource("AWS::ECR::Repository", { ImageTagMutability: "IMMUTABLE", EncryptionConfiguration: { EncryptionType: "AES256" }, Tags: tags }, retain),
    RuntimeSecret: resource("AWS::SecretsManager::Secret", { Description: "Populate approved runtime keys separately; empty object cannot start the worker", SecretString: "{}", Tags: tags }, retain),
    OperationalLogs: resource("AWS::Logs::LogGroup", { RetentionInDays: 14, Tags: tags }, retain),
    WorkerRole: resource("AWS::IAM::Role", {
      AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }] },
      ManagedPolicyArns: [sub("arn:${AWS::Partition}:iam::aws:policy/AmazonSSMManagedInstanceCore")],
      Policies: [{ PolicyName: "ScopedWorkerRuntime", PolicyDocument: { Version: "2012-10-17", Statement: [
        { Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: ref("RuntimeSecret") },
        { Effect: "Allow", Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource: [attr("WorkerRepository", "Arn"), attr("GatewayRepository", "Arn")] },
        { Effect: "Allow", Action: "ecr:GetAuthorizationToken", Resource: "*" },
        { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], Resource: attr("OperationalLogs", "Arn") },
        { Effect: "Allow", Action: "cloudwatch:PutMetricData", Resource: "*", Condition: { StringEquals: { "cloudwatch:namespace": "ComFlowWorker" } } },
      ] } }], Tags: tags,
    }),
    WorkerProfile: resource("AWS::IAM::InstanceProfile", { Roles: [ref("WorkerRole")] }),
    WorkerHost: resource("AWS::EC2::Instance", {
      ImageId: ref("ApprovedAmiId"), InstanceType: "t3.medium", AvailabilityZone: ref("AvailabilityZone"), SubnetId: ref("Subnet"), SecurityGroupIds: [ref("Firewall")], IamInstanceProfile: ref("WorkerProfile"),
      CreditSpecification: { CPUCredits: "standard" }, DisableApiTermination: true,
      MetadataOptions: { HttpTokens: "required", HttpEndpoint: "enabled", HttpPutResponseHopLimit: 1 },
      BlockDeviceMappings: [{ DeviceName: "/dev/sda1", Ebs: { VolumeType: "gp3", VolumeSize: 40, Encrypted: true, DeleteOnTermination: true } }], Tags: tags,
      // No UserData or auto-start: provisioning approval is distinct from live queue consumption.
    }, { DependsOn: "InternetRoute" }),
    StateDisk: resource("AWS::EC2::Volume", { AvailabilityZone: ref("AvailabilityZone"), Size: 10, VolumeType: "gp3", Encrypted: true, Tags: [...tags, { Key: "ComFlowBackup", Value: ref("AWS::StackName") }] }, retain),
    StateAttachment: resource("AWS::EC2::VolumeAttachment", { InstanceId: ref("WorkerHost"), VolumeId: ref("StateDisk"), Device: "/dev/sdf" }),
    PublicAddress: resource("AWS::EC2::EIP", { Domain: "vpc", Tags: tags }, { DependsOn: "GatewayAttachment" }),
    AddressAttachment: resource("AWS::EC2::EIPAssociation", { InstanceId: ref("WorkerHost"), AllocationId: attr("PublicAddress", "AllocationId") }),
    SnapshotRole: resource("AWS::IAM::Role", { AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "dlm.amazonaws.com" }, Action: "sts:AssumeRole" }] }, ManagedPolicyArns: [sub("arn:${AWS::Partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole")], Tags: tags }),
    StateBackups: resource("AWS::DLM::LifecyclePolicy", { Description: "Weekly pilot state snapshots retain two", State: "ENABLED", ExecutionRoleArn: attr("SnapshotRole", "Arn"), PolicyDetails: { ResourceTypes: ["VOLUME"], TargetTags: [{ Key: "ComFlowBackup", Value: ref("AWS::StackName") }], Schedules: [{ Name: "WeeklyState", CreateRule: { CronExpression: "cron(0 3 ? * SUN *)" }, RetainRule: { Count: 2 }, CopyTags: true }] } }),
    AlertTopic: resource("AWS::SNS::Topic", { Subscription: [{ Protocol: "email", Endpoint: ref("OwnerEmail") }], Tags: tags }),
    Budget: resource("AWS::Budgets::Budget", { Budget: { BudgetName: sub("${AWS::StackName}-monthly"), BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: 50, Unit: "USD" } }, NotificationsWithSubscribers: [
      ...[["ACTUAL", 40], ["ACTUAL", 50], ["FORECASTED", 50]].map(([NotificationType, Threshold]) => ({ Notification: { NotificationType, ComparisonOperator: "GREATER_THAN", ThresholdType: "ABSOLUTE_VALUE", Threshold }, Subscribers: [{ SubscriptionType: "EMAIL", Address: ref("OwnerEmail") }] })),
    ] }),
  };
  for (const [name, metric, namespace, dimensions, threshold, comparison, statistic] of [
    ["HostStatusAlarm", "StatusCheckFailed", "AWS/EC2", [{ Name: "InstanceId", Value: ref("WorkerHost") }], 0, "GreaterThanThreshold", "Maximum"],
    ["CpuAlarm", "CPUUtilization", "AWS/EC2", [{ Name: "InstanceId", Value: ref("WorkerHost") }], 90, "GreaterThanThreshold", "Average"],
    ["CreditAlarm", "CPUCreditBalance", "AWS/EC2", [{ Name: "InstanceId", Value: ref("WorkerHost") }], 10, "LessThanThreshold", "Average"],
    ["WorkerHealthAlarm", "Healthy", "ComFlowWorker", [{ Name: "Deployment", Value: "comflow-staging-worker" }], 1, "LessThanThreshold", "Minimum"],
    ["DiskAlarm", "StateDiskUsedPercent", "ComFlowWorker", [{ Name: "Deployment", Value: "comflow-staging-worker" }], 80, "GreaterThanThreshold", "Maximum"],
  ]) resources[name] = resource("AWS::CloudWatch::Alarm", { MetricName: metric, Namespace: namespace, Dimensions: dimensions, Threshold: threshold, ComparisonOperator: comparison, Statistic: statistic, Period: 300, EvaluationPeriods: 2, TreatMissingData: namespace === "ComFlowWorker" ? "breaching" : "missing", AlarmActions: [ref("AlertTopic")] });
  return {
    AWSTemplateFormatVersion: "2010-09-09", Description: "REVIEW ONLY: single-host ComFlow pilot; no application auto-start, DNS or live keys",
    Parameters: {
      ApprovedAmiId: { Type: "AWS::EC2::Image::Id", Description: "Verify official Ubuntu 24.04 amd64 owner, SSM readiness and /dev/sda1 root mapping before approval" },
      AvailabilityZone: { Type: "AWS::EC2::AvailabilityZone::Name", Description: "Select an Ohio AZ" },
      VpcCidr: { Type: "String", Description: "Reviewed non-overlapping IPv4 CIDR; no default" },
      SubnetCidr: { Type: "String", Description: "Reviewed public subnet within VpcCidr; no default" },
      OwnerEmail: { Type: "String", AllowedPattern: "[^@\\s]+@[^@\\s]+\\.[^@\\s]+", Description: "Creating a budget later will activate email notifications" },
    },
    Rules: { OhioOnly: { Assertions: [{ Assert: { "Fn::Equals": [ref("AWS::Region"), "us-east-2"] }, AssertDescription: "This reviewed pilot is scoped to Ohio" }] } },
    Resources: resources,
    Outputs: Object.fromEntries([
      ["WorkerInstanceId", ref("WorkerHost")], ["StateVolumeId", ref("StateDisk")], ["PublicIPv4", ref("PublicAddress")], ["RuntimeSecretArn", ref("RuntimeSecret")], ["WorkerImageRepository", attr("WorkerRepository", "RepositoryUri")], ["GatewayImageRepository", attr("GatewayRepository", "RepositoryUri")], ["OperationalLogGroup", ref("OperationalLogs")],
    ].map(([name, Value]) => [name, { Value }])),
  };
}
