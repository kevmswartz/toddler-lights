<#
    Finds Java installations and helps configure JAVA_HOME
    Run this from PowerShell:
        ./scripts/setup-java.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "=== Java Setup Helper ===" -ForegroundColor Cyan
Write-Host ""

# Check if JAVA_HOME is already set
$currentJavaHome = $env:JAVA_HOME
if ($currentJavaHome) {
    Write-Host "JAVA_HOME is currently set to:" -ForegroundColor Yellow
    Write-Host "  $currentJavaHome" -ForegroundColor White

    $javaExe = Join-Path $currentJavaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        Write-Host ""
        Write-Host "Current Java version:" -ForegroundColor Yellow
        $currentVersion = & $javaExe -version 2>&1 | Select-Object -First 1
        Write-Host "  $currentVersion" -ForegroundColor White

        # Check if it's compatible
        if ($currentVersion -match 'version "(\d+)') {
            $majorVersion = [int]$matches[1]
            if ($majorVersion -lt 17) {
                Write-Host ""
                Write-Host "⚠ This version is too old for Android (requires Java 17+)" -ForegroundColor Red
                Write-Host "Searching for newer Java installations..." -ForegroundColor Yellow
            } else {
                Write-Host ""
                Write-Host "✓ This version is compatible with Android" -ForegroundColor Green
                Write-Host ""
                $keepCurrent = Read-Host "Keep current Java version? (y/n)"
                if ($keepCurrent -eq 'y') {
                    Write-Host "Keeping current JAVA_HOME configuration." -ForegroundColor Green
                    exit 0
                }
            }
        }
    } else {
        Write-Host "  WARNING: java.exe not found at this location" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Searching for Java installations..." -ForegroundColor Cyan
Write-Host ""

$foundJavas = @()

# Common Java installation locations
$searchPaths = @(
    "$env:ProgramFiles\Java",
    "$env:ProgramFiles\Android\Android Studio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jre",
    "${env:ProgramFiles(x86)}\Java",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\jdk",
    "$env:USERPROFILE\scoop\apps\openjdk*\current",
    "C:\Program Files\Eclipse Adoptium",
    "C:\Program Files\OpenJDK",
    "C:\Program Files\Microsoft\jdk-*"
)

foreach ($basePath in $searchPaths) {
    if ($basePath -like "*`**") {
        # Wildcard path - expand it
        $expanded = Get-ChildItem -Path ($basePath -replace '\*$', '') -Directory -ErrorAction SilentlyContinue
        foreach ($dir in $expanded) {
            $javaExe = Join-Path $dir.FullName "bin\java.exe"
            if (Test-Path $javaExe) {
                $foundJavas += $dir.FullName
            }
        }
    } else {
        # Direct path
        if (Test-Path $basePath) {
            # Check subdirectories for JDK installations
            $jdkDirs = Get-ChildItem -Path $basePath -Directory -ErrorAction SilentlyContinue | Where-Object {
                $_.Name -match "jdk|jbr|jre"
            }

            foreach ($jdkDir in $jdkDirs) {
                $javaExe = Join-Path $jdkDir.FullName "bin\java.exe"
                if (Test-Path $javaExe) {
                    $foundJavas += $jdkDir.FullName
                }
            }

            # Also check the base path itself
            $javaExe = Join-Path $basePath "bin\java.exe"
            if (Test-Path $javaExe) {
                $foundJavas += $basePath
            }
        }
    }
}

if ($foundJavas.Count -eq 0) {
    Write-Host "No Java installations found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Java (JDK 11 or later):" -ForegroundColor Yellow
    Write-Host "  Option 1: Install via Android Studio (includes JDK)" -ForegroundColor White
    Write-Host "  Option 2: Download from https://adoptium.net/" -ForegroundColor White
    Write-Host "  Option 3: Install via Chocolatey: choco install openjdk11" -ForegroundColor White
    Write-Host "  Option 4: Install via Scoop: scoop install openjdk" -ForegroundColor White
    exit 1
}

Write-Host "Found $($foundJavas.Count) Java installation(s):" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Android Gradle plugin requires Java 17 or later" -ForegroundColor Yellow
Write-Host ""

$javaVersions = @()

for ($i = 0; $i -lt $foundJavas.Count; $i++) {
    $javaHome = $foundJavas[$i]
    $javaExe = Join-Path $javaHome "bin\java.exe"

    # Get version
    $versionString = ""
    $majorVersion = 0
    try {
        $versionOutput = & $javaExe -version 2>&1 | Select-Object -First 1
        $versionString = $versionOutput

        # Extract major version number
        if ($versionOutput -match 'version "(\d+)\.') {
            $majorVersion = [int]$matches[1]
        } elseif ($versionOutput -match 'version "(\d+)"') {
            $majorVersion = [int]$matches[1]
        }
    } catch {
        $versionString = "Could not determine"
    }

    $javaVersions += $majorVersion

    $color = "White"
    $warning = ""
    if ($majorVersion -ge 17) {
        $color = "Green"
        $warning = " ✓ Compatible"
    } elseif ($majorVersion -gt 0 -and $majorVersion -lt 17) {
        $color = "Yellow"
        $warning = " ⚠ Too old for Android (requires Java 17+)"
    }

    Write-Host "[$($i + 1)] $javaHome" -ForegroundColor $color
    Write-Host "    Version: $versionString$warning" -ForegroundColor Gray
    Write-Host ""
}

# Ask user to select
Write-Host "Select a Java installation to use (1-$($foundJavas.Count)):" -ForegroundColor Cyan
$selection = Read-Host "Enter number"

try {
    $index = [int]$selection - 1
    if ($index -lt 0 -or $index -ge $foundJavas.Count) {
        throw "Invalid selection"
    }

    $selectedJava = $foundJavas[$index]
    $selectedVersion = $javaVersions[$index]

    Write-Host ""
    Write-Host "Selected: $selectedJava" -ForegroundColor Yellow

    # Warn if version is too old
    if ($selectedVersion -gt 0 -and $selectedVersion -lt 17) {
        Write-Host ""
        Write-Host "WARNING: Java $selectedVersion is too old for Android Gradle plugin!" -ForegroundColor Red
        Write-Host "Android requires Java 17 or later." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Please install Java 17 or later:" -ForegroundColor Yellow
        Write-Host "  - Download from: https://adoptium.net/temurin/releases/?version=17" -ForegroundColor White
        Write-Host "  - Or via Chocolatey: choco install temurin17" -ForegroundColor White
        Write-Host "  - Or via Scoop: scoop install openjdk17" -ForegroundColor White
        Write-Host ""
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne 'y') {
            exit 1
        }
    } elseif ($selectedVersion -ge 17) {
        Write-Host "Java $selectedVersion is compatible with Android! ✓" -ForegroundColor Green
    }

    Write-Host ""

    # Set for current session
    $env:JAVA_HOME = $selectedJava
    $env:Path = "$selectedJava\bin;$env:Path"

    Write-Host "JAVA_HOME set for current PowerShell session!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To set JAVA_HOME permanently, run:" -ForegroundColor Yellow
    Write-Host "  [System.Environment]::SetEnvironmentVariable('JAVA_HOME', '$selectedJava', 'User')" -ForegroundColor White
    Write-Host ""
    Write-Host "Or add this to your PowerShell profile:" -ForegroundColor Yellow
    Write-Host "  `$env:JAVA_HOME = '$selectedJava'" -ForegroundColor White
    Write-Host "  `$env:Path = `"`$env:JAVA_HOME\bin;`$env:Path`"" -ForegroundColor White
    Write-Host ""

    # Ask if user wants to set permanently
    $setPermanent = Read-Host "Set JAVA_HOME permanently? (y/n)"
    if ($setPermanent -eq 'y') {
        [System.Environment]::SetEnvironmentVariable('JAVA_HOME', $selectedJava, 'User')

        # Update Path to include Java bin
        $currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
        $javaBin = "$selectedJava\bin"
        if ($currentPath -notlike "*$javaBin*") {
            [System.Environment]::SetEnvironmentVariable('Path', "$javaBin;$currentPath", 'User')
        }

        Write-Host ""
        Write-Host "JAVA_HOME set permanently!" -ForegroundColor Green
        Write-Host "You may need to restart PowerShell or your IDE for changes to take effect." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "You can now run: ./scripts/build-android.ps1" -ForegroundColor Cyan

} catch {
    Write-Host "Invalid selection" -ForegroundColor Red
    exit 1
}
