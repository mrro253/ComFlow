"""Synthetic Compose schema preview only; never starts a container."""
import json
import os
import host

c = {'workerImage': '111122223333.dkr.ecr.us-east-2.amazonaws.com/synthetic-worker@sha256:' + 'a' * 64,
     'gatewayImage': '111122223333.dkr.ecr.us-east-2.amazonaws.com/synthetic-gateway@sha256:' + 'b' * 64}
preview = host.compose(c)
preview['services']['worker']['env_file'] = [os.environ['COMFLOW_PREVIEW_ENV_FILE']]
print(json.dumps(preview))
