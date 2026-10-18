$ErrorActionPreference='Stop'
$fitAndroidRoot=$PSScriptRoot
$fitProject=Split-Path $fitAndroidRoot -Parent
$fitWorkspace=Split-Path $fitProject -Parent
$fitToolchain=Join-Path $fitWorkspace 'nasdaq-android/toolchain'
$fitJdk=(Get-ChildItem -LiteralPath (Join-Path $fitToolchain 'jdk') -Directory | Select-Object -First 1).FullName
$fitTools=Join-Path $fitToolchain 'sdk/build-tools/34.0.0'
$fitPlatform=Join-Path $fitToolchain 'sdk/platforms/android-34/android.jar'
$fitMain=Join-Path $fitAndroidRoot 'app/src/main'
$fitBuild=Join-Path $fitAndroidRoot 'build'
$fitDist=Join-Path $fitProject 'dist'
$fitSigning=Join-Path $fitAndroidRoot 'signing'
$fitApk=Join-Path $fitDist 'qinglian-fit-0.7.2.apk'
foreach($fitRequired in @($fitJdk,$fitTools,$fitPlatform)){if(-not(Test-Path -LiteralPath $fitRequired)){throw "Missing Android toolchain: $fitRequired"}}
$env:JAVA_HOME=$fitJdk
$env:PATH=(Join-Path $fitJdk 'bin')+';'+$env:PATH
function Assert-FitBuild {if($LASTEXITCODE -ne 0){throw "Android build step failed: $LASTEXITCODE"}}
New-Item -ItemType Directory -Force -Path $fitBuild,(Join-Path $fitBuild 'classes'),$fitDist,$fitSigning | Out-Null
python (Join-Path $fitProject 'scripts/prepare-android.py')
Assert-FitBuild
& (Join-Path $fitTools 'aapt.exe') package -f -M (Join-Path $fitMain 'AndroidManifest.xml') -S (Join-Path $fitMain 'res') -A (Join-Path $fitBuild 'assets') -I $fitPlatform -F (Join-Path $fitBuild 'base.apk')
Assert-FitBuild
$fitJavaFiles=@(Get-ChildItem -LiteralPath (Join-Path $fitMain 'java') -Recurse -File -Filter '*.java' | ForEach-Object {$_.FullName})
& (Join-Path $fitJdk 'bin/javac.exe') -encoding UTF-8 -source 8 -target 8 -classpath $fitPlatform -d (Join-Path $fitBuild 'classes') @fitJavaFiles
Assert-FitBuild
& (Join-Path $fitJdk 'bin/jar.exe') cf (Join-Path $fitBuild 'classes.jar') -C (Join-Path $fitBuild 'classes') .
Assert-FitBuild
& (Join-Path $fitTools 'd8.bat') --lib $fitPlatform --min-api 26 --output $fitBuild (Join-Path $fitBuild 'classes.jar')
Assert-FitBuild
Copy-Item -LiteralPath (Join-Path $fitBuild 'base.apk') -Destination (Join-Path $fitBuild 'unsigned.apk') -Force
Push-Location $fitBuild
try {& (Join-Path $fitTools 'aapt.exe') add unsigned.apk classes.dex; Assert-FitBuild}finally{Pop-Location}
& (Join-Path $fitTools 'zipalign.exe') -f -p 4 (Join-Path $fitBuild 'unsigned.apk') (Join-Path $fitBuild 'aligned.apk')
Assert-FitBuild
$fitKeystore=Join-Path $fitSigning 'qinglian-personal.p12'
$fitPassword=Join-Path $fitSigning 'password.txt'
if(-not(Test-Path -LiteralPath $fitKeystore)){
    if(-not(Test-Path -LiteralPath $fitPassword)){
        $fitRandom=New-Object byte[] 32
        $fitRng=[Security.Cryptography.RandomNumberGenerator]::Create()
        try {$fitRng.GetBytes($fitRandom)}finally{$fitRng.Dispose()}
        [IO.File]::WriteAllText($fitPassword,[Convert]::ToBase64String($fitRandom),(New-Object Text.UTF8Encoding($false)))
    }
    & (Join-Path $fitJdk 'bin/keytool.exe') -genkeypair -storetype PKCS12 -keystore $fitKeystore -storepass:file $fitPassword -keypass:file $fitPassword -alias qinglian -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Qinglian FIT Personal App'
    Assert-FitBuild
}
if(-not(Test-Path -LiteralPath $fitPassword)){throw 'Signing password file missing; preserve the existing key and recover its matching password.'}
& (Join-Path $fitTools 'apksigner.bat') sign --ks $fitKeystore --ks-key-alias qinglian --ks-pass ('file:'+$fitPassword) --out $fitApk (Join-Path $fitBuild 'aligned.apk')
Assert-FitBuild
& (Join-Path $fitTools 'apksigner.bat') verify --verbose $fitApk
Assert-FitBuild
& (Join-Path $fitTools 'aapt.exe') dump badging $fitApk
Assert-FitBuild
$fitHash=(Get-FileHash -LiteralPath $fitApk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($fitApk+'.sha256'),$fitHash+'  '+[IO.Path]::GetFileName($fitApk)+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
Write-Output "APK ready: $fitApk"
Write-Output "SHA256: $fitHash"
