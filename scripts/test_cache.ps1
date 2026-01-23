# Тест кэширования Google Sheets API
$API_URL = "https://chronosphere7777.pythonanywhere.com"
$CATALOG_URL = "$API_URL/api/shop/1Dk0vQ3_K0t7Sqi50h85U_RYPdGwgXAG0xeYkzW5mvpc/catalog"

Write-Host "╔══════════════════════════════════════════════════════════╗"
Write-Host "║     ТЕСТ КЭШИРОВАНИЯ GOOGLE SHEETS                       ║"
Write-Host "╚══════════════════════════════════════════════════════════╝"
Write-Host ""

# Проверяем статистику кэша перед тестом
Write-Host "📊 Статистика кэша ДО теста:"
$cacheStatsBefore = Invoke-RestMethod -Uri "$API_URL/api/debug/cache-stats" -Method Get
$cacheStatsBefore | ConvertTo-Json -Depth 10
Write-Host ""
Write-Host "================================================"
Write-Host ""

# Первый запрос (должен обратиться к Google Sheets)
Write-Host "🔵 ЗАПРОС #1 - Первый запрос (должен идти в Google Sheets)"
Write-Host "   Запрашиваю каталог магазина..."
$start1 = Get-Date
try {
    $response1 = Invoke-WebRequest -Uri $CATALOG_URL -Method Get
    $end1 = Get-Date
    $time1 = ($end1 - $start1).TotalSeconds
    
    Write-Host "   HTTP Status: $($response1.StatusCode)"
    Write-Host "   Время ответа: $($time1.ToString('F3'))s"
    Write-Host "   Размер ответа: $($response1.Content.Length) байт"
} catch {
    Write-Host "   ❌ Ошибка: $_" -ForegroundColor Red
}
Write-Host ""

# Небольшая пауза
Start-Sleep -Seconds 1

# Второй запрос (должен взять из кэша)
Write-Host "🟢 ЗАПРОС #2 - Повторный запрос (должен взять из кэша)"
Write-Host "   Запрашиваю тот же каталог..."
$start2 = Get-Date
try {
    $response2 = Invoke-WebRequest -Uri $CATALOG_URL -Method Get
    $end2 = Get-Date
    $time2 = ($end2 - $start2).TotalSeconds
    
    Write-Host "   HTTP Status: $($response2.StatusCode)"
    Write-Host "   Время ответа: $($time2.ToString('F3'))s"
    Write-Host "   Размер ответа: $($response2.Content.Length) байт"
} catch {
    Write-Host "   ❌ Ошибка: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "================================================"
Write-Host ""

# Проверяем статистику кэша после теста
Write-Host "📊 Статистика кэша ПОСЛЕ теста:"
$cacheStatsAfter = Invoke-RestMethod -Uri "$API_URL/api/debug/cache-stats" -Method Get
$cacheStatsAfter | ConvertTo-Json -Depth 10
Write-Host ""

Write-Host "================================================"
Write-Host "РЕЗУЛЬТАТЫ ТЕСТА"
Write-Host "================================================"
Write-Host ""

# Сравнение времени
if ($time1 -and $time2) {
    $speedup = [math]::Round($time1 / $time2, 2)
    
    if ($time2 -lt $time1) {
        Write-Host "✅ КЭШИРОВАНИЕ РАБОТАЕТ!" -ForegroundColor Green
        Write-Host "   Запрос #1 (Google Sheets): $($time1.ToString('F3'))s"
        Write-Host "   Запрос #2 (кэш):           $($time2.ToString('F3'))s"
        Write-Host "   Ускорение: ${speedup}x" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   🎉 Второй запрос НЕ обратился к Google Sheets!"
        Write-Host "   Данные были взяты из серверного кэша."
    } else {
        Write-Host "⚠️  Кэш может не работать" -ForegroundColor Yellow
        Write-Host "   Запрос #1: $($time1.ToString('F3'))s"
        Write-Host "   Запрос #2: $($time2.ToString('F3'))s"
        Write-Host ""
        Write-Host "   Проверьте логи сервера или cache-stats выше."
    }
}

Write-Host ""
Write-Host "💡 Кэш действителен в течение 5 минут (300 секунд)"
Write-Host "   После истечения TTL будет новый запрос к Google Sheets"

# Показываем детали из cache-stats
Write-Host ""
Write-Host "📋 Детали кэша:"
if ($cacheStatsAfter.sheets_cache.total_entries -gt 0) {
    Write-Host "   Записей в кэше: $($cacheStatsAfter.sheets_cache.total_entries)"
    Write-Host "   TTL: $($cacheStatsAfter.sheets_cache.ttl_seconds) секунд"
    
    foreach ($entry in $cacheStatsAfter.sheets_cache.entries) {
        Write-Host ""
        Write-Host "   Ключ: $($entry.key)"
        Write-Host "   Возраст: $($entry.age_seconds) сек"
        Write-Host "   Осталось: $($entry.ttl_remaining_seconds) сек"
        Write-Host "   Валиден: $($entry.is_valid)"
        Write-Host "   Размер данных: $($entry.data_size) строк"
    }
} else {
    Write-Host "   Кэш пуст" -ForegroundColor Yellow
}
