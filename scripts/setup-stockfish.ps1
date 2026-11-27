$ErrorActionPreference = 'Stop'
$engineDir = Join-Path $PSScriptRoot '../personal/stockfish'
$exe = Join-Path $engineDir 'stockfish.exe'
if (Test-Path -LiteralPath $exe) {
    Write-Output 'Stockfish is already installed.'
    exit 0
}

$null = New-Item -ItemType Directory -Path $engineDir -Force
$engineDir = (Resolve-Path -LiteralPath $engineDir).Path
$exe = Join-Path $engineDir 'stockfish.exe'
$archive = Join-Path $engineDir 'stockfish-19-windows-x64.zip'
$release = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip'
$sha256 = '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7'

try {
    curl.exe --fail --location --silent --show-error --output $archive $release
    if ($LASTEXITCODE -ne 0) { throw 'Failed to download Stockfish 19.' }
    $stream = [IO.File]::OpenRead($archive)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $actual = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '')
    } finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
    if ($actual -ne $sha256) {
        throw 'Stockfish archive SHA-256 mismatch.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        $entries = @($zip.Entries | Where-Object Name -like '*.exe')
        if ($entries.Count -ne 1) { throw 'Expected one Stockfish executable in the official archive.' }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], "$exe.part", $true)
        Move-Item -LiteralPath "$exe.part" -Destination $exe
    } finally {
        $zip.Dispose()
    }
    Write-Output 'Stockfish 19 x64 installed and archive integrity verified.'
} finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
    if (Test-Path -LiteralPath "$exe.part") { Remove-Item -LiteralPath "$exe.part" }
}
