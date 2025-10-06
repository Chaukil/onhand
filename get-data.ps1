param(
    [Parameter(Mandatory=$true)][string]$ParamFile
)

$ErrorActionPreference = "Stop"

try {
    # Kiểm tra file tồn tại
    if (-not (Test-Path $ParamFile)) {
        throw "Parameter file not found: $ParamFile"
    }
    
    # Đọc parameters từ file JSON
    $paramsJson = Get-Content $ParamFile -Raw -Encoding UTF8
    $params = $paramsJson | ConvertFrom-Json
    
    # Validate parameters
    if (-not $params.server -or -not $params.user -or -not $params.pass -or -not $params.sql) {
        throw "Missing required parameters in file"
    }
    
    # Connection string với encoding settings
    $connStr = "Driver={iSeries Access ODBC Driver};System=$($params.server);Uid=$($params.user);Pwd=$($params.pass);CCSID=37;Translate=1;ConnCCSID=1208"
    
    # Tạo kết nối
    $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
    $conn.Open()
    
    # Tạo command
    $cmd = New-Object System.Data.Odbc.OdbcCommand($params.sql, $conn)
    $cmd.CommandTimeout = 300
    
    # Thực thi
    $reader = $cmd.ExecuteReader()
    
    $results = @()
    while ($reader.Read()) {
        $row = @{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $name = $reader.GetName($i)
            $value = $reader.GetValue($i)
            
            if ($value -is [System.DBNull]) {
                $row[$name] = $null
            } elseif ($value -is [string]) {
                # Clean string value
                $cleanValue = $value.Trim()
                # Remove non-printable characters
                $cleanValue = $cleanValue -replace '[\x00-\x1F\x7F-\x9F]', ''
                $row[$name] = $cleanValue
            } else {
                $row[$name] = $value
            }
        }
        $results += $row
    }
    
    $reader.Close()
    $conn.Close()
    
    # Output JSON
    if ($results.Count -eq 0) {
        Write-Output "[]"
    } else {
        $results | ConvertTo-Json -Depth 3 -Compress
    }

} catch {
    $errorMsg = $_.Exception.Message
    
    # Common error translations
    if ($errorMsg -like "*Login failed*") {
        $errorMsg = "Sai tài khoản hoặc mật khẩu IBM i"
    } elseif ($errorMsg -like "*Communication*") {
        $errorMsg = "Không thể kết nối đến $($params.server)"
    } elseif ($errorMsg -like "*SQL*") {
        $errorMsg = "Lỗi SQL: $errorMsg"
    }
    
    Write-Error $errorMsg
    exit 1
} finally {
    # Cleanup
    if ($conn -and $conn.State -eq 'Open') {
        $conn.Close()
    }
}
