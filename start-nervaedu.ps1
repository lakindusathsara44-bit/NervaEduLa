$ErrorActionPreference = 'Stop'
$appFolder = $PSScriptRoot
$healthUrl = 'http://127.0.0.1:4173/api/me'
$isRunning = $false

try {
    $null = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    $isRunning = $true
} catch {
    $isRunning = $false
}

if (-not $isRunning) {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        throw 'Node.js is required. Install Node.js 22 or newer, then run this launcher again.'
    }

    Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $appFolder -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $null = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
            $isRunning = $true
            break
        } catch {
            $isRunning = $false
        }
    }
}

if (-not $isRunning) {
    throw 'NervaEdu did not start. Check that port 4173 is available and try again.'
}

Start-Process 'http://localhost:4173'
