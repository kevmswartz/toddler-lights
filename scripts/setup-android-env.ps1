param(
    [string]$SdkPath,
    [string]$JdkPath,
    [string]$NdkPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-SdkPath {
    param([string]$InputPath)
    if ($InputPath) { return (Resolve-Path -LiteralPath $InputPath).Path }
    if ($Env:ANDROID_HOME) { return $Env:ANDROID_HOME }
    $default = Join-Path -Path $Env:LOCALAPPDATA -ChildPath 'Android\Sdk'
    if (Test-Path $default) { return $default }
    throw "Android SDK not found. Pass -SdkPath or install the SDK."
}

function Resolve-JdkPath {
    param([string]$InputPath)
    if ($InputPath) { return (Resolve-Path -LiteralPath $InputPath).Path }
    if ($Env:JAVA_HOME) { return $Env:JAVA_HOME }
    $possible = @(
        'C:\Program Files\Microsoft\jdk-17.0.9.8-hotspot',
        'C:\Program Files\Java\jdk-17',
        'C:\Program Files\Eclipse Adoptium\jdk-17',
        'C:\Program Files\Microsoft\jdk-17'
    )
    foreach ($path in $possible) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

function Resolve-NdkPath {
    param(
        [string]$InputPath,
        [string]$SdkRoot
    )

    if ($InputPath) {
        return (Resolve-Path -LiteralPath $InputPath).Path
    }

    if ($Env:NDK_HOME) {
        return $Env:NDK_HOME
    }
    if ($Env:ANDROID_NDK_HOME) {
        return $Env:ANDROID_NDK_HOME
    }

    $ndkRoot = Join-Path -Path $SdkRoot -ChildPath 'ndk'
    if (Test-Path $ndkRoot) {
        $candidates = Get-ChildItem -LiteralPath $ndkRoot -Directory | Sort-Object -Property Name -Descending
        foreach ($candidate in $candidates) {
            $toolchain = Join-Path $candidate.FullName 'toolchains'
            if (Test-Path $toolchain) {
                return $candidate.FullName
            }
        }
    }

    return $null
}

$sdkRoot = Resolve-SdkPath -InputPath $SdkPath
$jdkRoot = Resolve-JdkPath -InputPath $JdkPath
$ndkRoot = Resolve-NdkPath -InputPath $NdkPath -SdkRoot $sdkRoot

[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkRoot, 'User')

if ($jdkRoot) {
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkRoot, 'User')
}

if ($ndkRoot) {
    [Environment]::SetEnvironmentVariable('NDK_HOME', $ndkRoot, 'User')
    [Environment]::SetEnvironmentVariable('ANDROID_NDK_HOME', $ndkRoot, 'User')
}

$sdkSubDirs = @(
    'platform-tools',
    'cmdline-tools\latest\bin',
    'cmdline-tools\bin',
    'tools\bin',
    'build-tools\34.0.0',
    'build-tools\33.0.2'
) | ForEach-Object {
    $candidate = Join-Path -Path $sdkRoot -ChildPath $_
    if (Test-Path $candidate) { $candidate }
}

$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathParts = ($currentPath -split ';') + $sdkSubDirs
$newPath = ($pathParts | Where-Object { $_ } | Select-Object -Unique) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

Write-Host "ANDROID_HOME set to $sdkRoot"
Write-Host "ANDROID_SDK_ROOT set to $sdkRoot"
if ($jdkRoot) {
    Write-Host "JAVA_HOME set to $jdkRoot"
} else {
    Write-Warning "JAVA_HOME not set (JDK 17 not detected)."
}
if ($ndkRoot) {
    Write-Host "NDK_HOME set to $ndkRoot"
    Write-Host "ANDROID_NDK_HOME set to $ndkRoot"
} else {
    Write-Warning "NDK_HOME not set. Install the Android NDK or specify -NdkPath."
}
Write-Host "Updated PATH entries for Android tools."
Write-Host "Restart PowerShell or sign out/in so the changes take effect."
