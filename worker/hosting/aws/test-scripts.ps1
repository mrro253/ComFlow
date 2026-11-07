$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out = Join-Path $repo ('.pgtest/aws-scripts-' + [guid]::NewGuid().ToString('N'))
function Run-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Offline deployment-script validation failed.' }
}
Push-Location $repo
try {
    Run-Checked node @('--test','worker/hosting/aws/prepare.test.mjs')
    Run-Checked node @('worker/hosting/aws/prepare.mjs','--out',$out)
    Run-Checked docker @('build','-f','worker/hosting/aws/Dockerfile.validator','-t','comflow-aws-validator:review','worker/hosting/aws')
    $mounts = @('--mount',"type=bind,source=$PSScriptRoot,target=/review,readonly",'--mount',"type=bind,source=$PSScriptRoot,target=/opt/comflow,readonly",'--mount',"type=bind,source=$out,target=/bundle,readonly")
    Run-Checked docker (@('run','--rm','--network','none') + $mounts + @('--entrypoint','/bin/sh','comflow-aws-validator:review','-c','python3 -m unittest discover -s /review -p test_host.py -v && cfn-lint -t /bundle/infrastructure.review.json -r us-east-2 --non-zero-exit-code error && python3 /review/check_units.py'))
    $envFile = Join-Path $out 'synthetic.env'
    [IO.File]::WriteAllText($envFile,"NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`nSUPABASE_SERVICE_ROLE_KEY=synthetic-not-a-key`n")
    $preview = & docker run --rm --network none --mount "type=bind,source=$PSScriptRoot,target=/review,readonly" -e "COMFLOW_PREVIEW_ENV_FILE=$envFile" --entrypoint python3 comflow-aws-validator:review /review/export_preview.py
    if ($LASTEXITCODE -ne 0) { throw 'Compose preview failed' }
    $compose = Join-Path $out 'compose.synthetic-check.json'
    [IO.File]::WriteAllText($compose, ($preview -join "`n"))
    Run-Checked docker @('compose','-p','comflow-schema-check','-f',$compose,'config','--quiet')
    Write-Output 'PASS: offline infrastructure, approval gates, synthetic host operations, systemd and Compose syntax. No AWS calls or live consumers.'
} finally { Pop-Location }
