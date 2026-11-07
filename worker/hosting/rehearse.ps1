$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$compose = Join-Path $PSScriptRoot 'compose.rehearsal.yaml'
$project = 'comflow-hosting-rehearsal'
function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Hosting rehearsal command failed.' }
}
function Invoke-Compose([string[]]$Arguments) {
    Invoke-Docker (@('compose','-p',$project,'-f',$compose) + $Arguments)
}
Push-Location $repo
try {
    # This exact project contains disposable fixtures only. Never pass live env files.
    Invoke-Compose -Arguments @('down','--volumes','--remove-orphans')
    Invoke-Docker -Arguments @('build','-f','worker/Dockerfile','-t','comflow-worker:review','.')
    Invoke-Docker -Arguments @('build','-f','worker/hosting/Dockerfile.gateway','-t','comflow-gateway:review','worker/hosting')
    Invoke-Compose -Arguments @('up','-d','--wait')
    $verify = @('exec','-T','worker','node','worker/node_modules/tsx/dist/cli.mjs','--tsconfig','worker/tsconfig.json','worker/src/hostingRehearsal.ts','verify')
    Invoke-Compose $verify
    & docker compose -p $project -f $compose run --rm --no-deps worker --rehearsal serve
    if ($LASTEXITCODE -ne 1) { throw 'Duplicate worker was not rejected by the kernel lock.' }
    Invoke-Compose -Arguments @('kill','-s','SIGKILL','worker')
    Invoke-Compose -Arguments @('up','-d','--wait')
    Invoke-Compose -Arguments @('restart','gateway')
    # Retry only a TLS readiness probe, never a code submission.
    Invoke-Compose -Arguments @('exec','-T','worker','node','-e', 'const https=require("https"),fs=require("fs");let n=0;function check(){const r=https.request({host:"localhost",port:8443,path:"/not-a-route",method:"POST",ca:fs.readFileSync("/state/rehearsal/tls.crt")},s=>{if(s.statusCode!==404)process.exit(1);s.resume()});r.on("error",()=>{if(++n>30)process.exit(1);setTimeout(check,100)});r.end()}check()')
    Invoke-Compose $verify
    $ready = (& docker compose -p $project -f $compose exec -T worker cat /state/rehearsal/ready.json) | ConvertFrom-Json
    if (-not $ready.recovered -or $ready.recoveryWrites -ne 1 -or -not $ready.emptyQueueStartup) { throw 'Restart recovery was not verified.' }
    Write-Output 'PASS: isolated image startup, HTTPS verification, agent isolation, duplicate lock, crash recovery and repeat verification.'
} finally {
    # Only this fixed synthetic project and its fixture volume are removed.
    & docker compose -p $project -f $compose down --volumes --remove-orphans
    Pop-Location
}
