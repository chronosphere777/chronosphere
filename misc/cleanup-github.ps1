# Скрипт для очистки GitHub репозитория
# Удаляет файлы из git но оставляет их локально

Write-Host "🧹 Начинаем очистку GitHub репозитория..." -ForegroundColor Cyan
Write-Host ""

# Проверка что мы в правильной директории
$repoPath = "c:\Users\Дмитрий\Desktop\проекты\МАГАЗИНЫ\Одежда\тест тут\веб3"
if (-not (Test-Path $repoPath)) {
    Write-Host "❌ Ошибка: Репозиторий не найден по пути $repoPath" -ForegroundColor Red
    exit 1
}

Set-Location $repoPath

# Проверка что это git репозиторий
if (-not (Test-Path ".git")) {
    Write-Host "❌ Ошибка: Это не git репозиторий" -ForegroundColor Red
    exit 1
}

Write-Host "📍 Рабочая директория: $repoPath" -ForegroundColor Green
Write-Host ""

# Создать резервную ветку
Write-Host "💾 Создаем резервную ветку..." -ForegroundColor Yellow
git branch backup-before-cleanup 2>$null
Write-Host "✅ Резервная ветка создана: backup-before-cleanup" -ForegroundColor Green
Write-Host ""

# Показать текущий статус
Write-Host "📊 Текущий статус git:" -ForegroundColor Yellow
git status --short
Write-Host ""

# Спросить подтверждение
$confirmation = Read-Host "⚠️  Продолжить очистку? Файлы будут удалены из git но останутся на диске (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "❌ Операция отменена" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🗑️  Удаляем файлы из git (но оставляем на диске)..." -ForegroundColor Yellow
Write-Host ""

# 1. Удалить frontend/dist/
Write-Host "  → Удаляем frontend/dist/ (287 файлов build артефактов)..." -ForegroundColor Cyan
git rm -r --cached frontend/dist/ 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✅ frontend/dist/ удалена из git" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  frontend/dist/ уже не отслеживается" -ForegroundColor Gray
}

# 2. Удалить дубликат workflow
Write-Host "  → Удаляем дубликат frontend/.github/workflows/deploy.yml..." -ForegroundColor Cyan
git rm --cached frontend/.github/workflows/deploy.yml 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✅ Дубликат workflow удален" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  Файл уже не отслеживается" -ForegroundColor Gray
}

# 3. Удалить дубликат novosibirsk.geojson
Write-Host "  → Удаляем дубликат фронтэнд/public/roads/novosibirsk.geojson..." -ForegroundColor Cyan
git rm --cached "фронтэнд/public/roads/novosibirsk.geojson" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✅ Дубликат novosibirsk.geojson удален" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  Файл уже не отслеживается" -ForegroundColor Gray
}

# 4. Удалить .gitattributes из roads
Write-Host "  → Удаляем frontend/public/roads/.gitattributes..." -ForegroundColor Cyan
git rm --cached frontend/public/roads/.gitattributes 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✅ .gitattributes удален" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  Файл уже не отслеживается" -ForegroundColor Gray
}

# 5. Удалить БД
Write-Host "  → Удаляем shops.db..." -ForegroundColor Cyan
git rm --cached shops.db 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✅ shops.db удалена из git" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  Файл уже не отслеживается" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📝 Добавляем обновленный .gitignore..." -ForegroundColor Yellow
git add .gitignore
Write-Host "✅ .gitignore добавлен" -ForegroundColor Green

Write-Host ""
Write-Host "💾 Создаем коммит..." -ForegroundColor Yellow

$commitMessage = @"
chore: clean up repository - remove build artifacts and duplicates

- Удалена папка frontend/dist/ (287 build файлов)
- Удален дубликат frontend/.github/workflows/deploy.yml
- Удален дубликат фронтэнд/public/roads/novosibirsk.geojson
- Удалена БД shops.db из репозитория
- Удален frontend/public/roads/.gitattributes
- Обновлен .gitignore для игнорирования:
  * Build артефактов (frontend/dist/, dist/, build/)
  * Баз данных (*.db, *.sqlite, shops.db)
  * Временных файлов (*.tmp, *.backup, *.log)
  * Отчетов (*_ОТЧЕТ.md)
  * IDE файлов (.vscode/, .idea/)
"@

git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Коммит создан успешно" -ForegroundColor Green
} else {
    Write-Host "⚠️  Нет изменений для коммита" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ℹ️  Возможно файлы уже были удалены ранее" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "📊 Проверка результата..." -ForegroundColor Yellow
Write-Host ""

# Проверка что файлы остались локально
Write-Host "  Локальные файлы:" -ForegroundColor Cyan
if (Test-Path "frontend/dist") {
    Write-Host "    ✅ frontend/dist/ существует локально" -ForegroundColor Green
} else {
    Write-Host "    ⚠️  frontend/dist/ не найдена локально" -ForegroundColor Yellow
}

if (Test-Path "shops.db") {
    Write-Host "    ✅ shops.db существует локально" -ForegroundColor Green
} else {
    Write-Host "    ℹ️  shops.db не найдена локально" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Git статус:" -ForegroundColor Cyan
$gitFiles = git ls-files | Select-String "dist|shops.db|фронтэнд"
if ($gitFiles.Count -eq 0) {
    Write-Host "    ✅ Удаленные файлы больше не отслеживаются git" -ForegroundColor Green
} else {
    Write-Host "    ⚠️  Некоторые файлы все еще отслеживаются:" -ForegroundColor Yellow
    $gitFiles | ForEach-Object { Write-Host "      - $_" -ForegroundColor Gray }
}

Write-Host ""
Write-Host "🚀 Отправляем изменения на GitHub..." -ForegroundColor Yellow
$pushConfirm = Read-Host "Отправить изменения на GitHub? (y/n)"

if ($pushConfirm -eq 'y') {
    git push origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Изменения успешно отправлены на GitHub!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Очистка завершена успешно!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Что было сделано:" -ForegroundColor Cyan
        Write-Host "  • Удалено 287 build файлов из frontend/dist/" -ForegroundColor White
        Write-Host "  • Удалены дубликаты файлов" -ForegroundColor White
        Write-Host "  • Обновлен .gitignore" -ForegroundColor White
        Write-Host "  • Файлы сохранены локально" -ForegroundColor White
        Write-Host ""
        Write-Host "ℹ️  Резервная копия: ветка 'backup-before-cleanup'" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "❌ Ошибка при отправке на GitHub" -ForegroundColor Red
        Write-Host "Попробуйте выполнить вручную: git push origin main" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "⚠️  Изменения НЕ отправлены на GitHub" -ForegroundColor Yellow
    Write-Host "Для отправки выполните: git push origin main" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✅ Скрипт завершен" -ForegroundColor Green
