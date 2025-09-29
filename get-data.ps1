param(
    [string]$SystemHost,
    [string]$Username, 
    [string]$Password,
    [string]$Sql
)

# Chỉ xuất JSON, không xuất debug info để tránh confuse
try {
    # Kiểm tra tham số
    if ([string]::IsNullOrEmpty($SystemHost) -or [string]::IsNullOrEmpty($Username) -or [string]::IsNullOrEmpty($Password) -or [string]::IsNullOrEmpty($Sql)) {
        throw "Thiếu tham số bắt buộc"
    }

    Add-Type -AssemblyName System.Data

    # Sử dụng ODBC drivers cho IBM i
    $connectionStrings = @(
        "Driver={iSeries Access ODBC Driver};System=$SystemHost;Uid=$Username;Pwd=$Password;DBQ=AMFLIBW;",
        "Driver={Client Access ODBC Driver (32-bit)};System=$SystemHost;Uid=$Username;Pwd=$Password;DBQ=AMFLIBW;"
    )

    $connection = $null
    $connectionSuccess = $false

    foreach ($connStr in $connectionStrings) {
        try {
            $connection = New-Object System.Data.Odbc.OdbcConnection($connStr)
            $connection.Open()
            $connectionSuccess = $true
            break
        } catch {
            if ($connection) {
                try { $connection.Close() } catch { }
                try { $connection.Dispose() } catch { }
                $connection = $null
            }
        }
    }

    if (-not $connectionSuccess) {
        throw "Không thể kết nối đến IBM i"
    }

    # Tạo ODBC command
    $command = New-Object System.Data.Odbc.OdbcCommand($Sql, $connection)
    $command.CommandTimeout = 300

    # Thực thi và đọc dữ liệu
    $reader = $command.ExecuteReader()
    $results = @()
    $rowCount = 0
    
    while ($reader.Read() -and $rowCount -lt 1000) {
        $row = [ordered]@{}
        
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $fieldName = $reader.GetName($i)
            
            if ($reader.IsDBNull($i)) {
                $row[$fieldName] = ""
            } else {
                $value = $reader.GetValue($i)
                
                # Đơn giản hóa xử lý dữ liệu
                if ($value -is [string]) {
                    $row[$fieldName] = $value.Trim()
                } elseif ($value -is [decimal] -or $value -is [double] -or $value -is [float]) {
                    $row[$fieldName] = [decimal]$value
                } elseif ($value -is [int] -or $value -is [long]) {
                    $row[$fieldName] = [int]$value
                } else {
                    $row[$fieldName] = $value.ToString().Trim()
                }
            }
        }
        
        $results += $row
        $rowCount++
    }

    # Đóng kết nối
    $reader.Close()
    $connection.Close()

    # Chỉ xuất JSON, không có text khác
    if ($results.Count -eq 0) {
        "[]"
    } else {
        $results | ConvertTo-Json -Depth 10 -Compress
    }

} catch {
    # Xuất lỗi ra stderr
    $errorObj = @{ 
        error = $_.Exception.Message
        details = $_.Exception.ToString()
    }
    $errorObj | ConvertTo-Json | Write-Error
    exit 1
}
