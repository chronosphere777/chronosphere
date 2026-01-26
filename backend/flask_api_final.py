from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import gspread
from google.oauth2.service_account import Credentials
import os
import requests
import hashlib
import json
import time
from datetime import datetime, timedelta
from security_middleware import init_security, rate_limit, validate_city, validate_shop_id

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://funny-lebkuchen-171bf4.netlify.app",
            "https://chronosphere777.github.io"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": False
    }
})

# ╨Э╨░╤Б╤В╤А╨╛╨╣╨║╨╕
GOOGLE_SHEETS_CREDS = '/home/chronosphere7777/mysite/chronosphere-484716-2a00094252b2.json'
MAIN_SPREADSHEET_ID = '1KMp94frXEYIwQ1Y7WTv9W03wgjf6zRLpyhEgrsirgqs'
DB_PATH = '/home/chronosphere7777/mysite/shops.db'

# Словарь перевода городов из 2ГИС в русские названия
CITY_TRANSLATION = {
    'tyumen': 'Тюмень',
    'moscow': 'Москва',
    'spb': 'Санкт-Петербург',
    'novosibirsk': 'Новосибирск',
    'ekaterinburg': 'Екатеринбург'
}

# ╨Ъ╤Н╤И ╨┤╨╗╤П ╨┤╨╛╤А╨╛╨│ (╨▓ ╨┐╨░╨╝╤П╤В╨╕) - ╨╛╨│╤А╨░╨╜╨╕╤З╨╡╨╜ ╨┐╨╛ ╤А╨░╨╖╨╝╨╡╤А╤Г
roads_cache = {}
CACHE_TTL = 3600  # 1 ╤З╨░╤Б
MAX_ROADS_CACHE_SIZE = 50  # ╨Ь╨░╨║╤Б╨╕╨╝╤Г╨╝ 50 ╨╖╨░╨┐╨╕╤Б╨╡╨╣ ╨▓ ╨║╤Н╤И╨╡

# ╨г╨▒╤А╨░╨╗╨╕ shops_cache - ╨╕╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╨╝ ╤В╨╛╨╗╤М╨║╨╛ SQLite ╨┤╨╗╤П ╤Н╨║╨╛╨╜╨╛╨╝╨╕╨╕ RAM

# ╨Р╨╗╤М╤В╨╡╤А╨╜╨░╤В╨╕╨▓╨╜╤Л╨╡ Overpass API ╤Б╨╡╤А╨▓╨╡╤А╤Л (╨┐╤А╨╛╨▒╤Г╨╡╨╝ ╤А╨░╨╖╨╜╤Л╨╡)
OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
]

# ╨У╨╗╨╛╨▒╨░╨╗╤М╨╜╨╛╨╡ ╨┐╨╛╨┤╨║╨╗╤О╤З╨╡╨╜╨╕╨╡ ╨║ Google Sheets (╨┐╨╡╤А╨╡╨╕╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╤В╤Б╤П)
_gspread_client = None
_gspread_main_spreadsheet = None

# Кэш для Google Sheets данных (защита от превышения квоты 60 req/min)
_sheets_cache = {}
SHEETS_CACHE_TTL = 300  # 5 минут кэш для Sheets данных

def get_gspread_client():
    """╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ╨╕╨╗╨╕ ╤Б╨╛╨╖╨┤╨░╤В╤М gspread ╨║╨╗╨╕╨╡╨╜╤В (╨┐╨╡╤А╨╡╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╨╜╨╕╨╡)"""
    global _gspread_client
    if _gspread_client is None:
        import os
        if not os.path.exists(GOOGLE_SHEETS_CREDS):
            print(f"ERROR: Credentials file not found: {GOOGLE_SHEETS_CREDS}")
            raise FileNotFoundError(f"Google Sheets credentials not found: {GOOGLE_SHEETS_CREDS}")
        
        scope = ['https://spreadsheets.google.com/feeds',
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(GOOGLE_SHEETS_CREDS, scopes=scope)
        _gspread_client = gspread.authorize(creds)
    return _gspread_client

def get_main_spreadsheet():
    """╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ╨│╨╗╨░╨▓╨╜╤Г╤О ╤В╨░╨▒╨╗╨╕╤Ж╤Г (╨┐╨╡╤А╨╡╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╨╜╨╕╨╡)"""
    global _gspread_main_spreadsheet
    if _gspread_main_spreadsheet is None:
        client = get_gspread_client()
        _gspread_main_spreadsheet = client.open_by_key(MAIN_SPREADSHEET_ID)
    return _gspread_main_spreadsheet


def migrate_db():
    """╨Ь╨╕╨│╤А╨░╤Ж╨╕╤П ╨С╨Ф: ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨║╨╛╨╗╨╛╨╜╨╛╨║ updated_at ╨╕ description ╨╡╤Б╨╗╨╕ ╨╕╤Е ╨╜╨╡╤В"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╤Б╤Г╤Й╨╡╤Б╤В╨▓╤Г╤О╤Й╨╕╨╡ ╨║╨╛╨╗╨╛╨╜╨║╨╕
        cursor.execute("PRAGMA table_info(shops)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'updated_at' not in columns:
            cursor.execute("ALTER TABLE shops ADD COLUMN updated_at TEXT")
            conn.commit()
        
        if 'description' not in columns:
            cursor.execute("ALTER TABLE shops ADD COLUMN description TEXT")
            conn.commit()
        
        # Создаем таблицу products для кэша каталогов
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id TEXT NOT NULL,
                product_name TEXT,
                category_path TEXT,
                price TEXT,
                price_numeric REAL,
                photo_url TEXT,
                description TEXT,
                updated_at TEXT,
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
            )
        """)
        
        # Индекс для быстрого поиска
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_products_name 
            ON products(product_name)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_products_shop 
            ON products(shop_id)
        """)
        
        # Таблица для отслеживания обновлений каталогов
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS catalog_updates (
                shop_id TEXT PRIMARY KEY,
                last_updated TEXT,
                status TEXT
            )
        """)
        
        conn.commit()
        conn.close()
    except Exception as e:
        pass


# ╨Т╤Л╨┐╨╛╨╗╨╜╤П╨╡╨╝ ╨╝╨╕╨│╤А╨░╤Ж╨╕╤О ╨┐╤А╨╕ ╤Б╤В╨░╤А╤В╨╡
migrate_db()

# рименить security middleware
init_security(app)


# Функция для постепенного кэширования каталогов (вызывается при запросах)
def try_cache_one_shop():
    """Пытается закэшировать один магазин который давно не обновлялся"""
    import re
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Находим магазин который нужно обновить (старше 6 часов или никогда)
        # Пропускаем магазины без spreadsheet_url
        cursor.execute("""
            SELECT s.shop_id, s.spreadsheet_url 
            FROM shops s
            LEFT JOIN catalog_updates cu ON s.shop_id = cu.shop_id
            WHERE s.spreadsheet_url IS NOT NULL
              AND s.spreadsheet_url != ''
              AND (cu.last_updated IS NULL 
                   OR datetime(cu.last_updated) < datetime('now', '-6 hours'))
            ORDER BY cu.last_updated ASC NULLS FIRST
            LIMIT 1
        """)
        
        shop_row = cursor.fetchone()
        
        if shop_row:
            shop_id, spreadsheet_url = shop_row
            
            if spreadsheet_url:
                # Извлекаем ID таблицы и gid
                match = re.search(r'/d/([a-zA-Z0-9-_]+)', spreadsheet_url)
                if match:
                    spreadsheet_id = match.group(1)
                    gid_match = re.search(r'[#&]gid=([0-9]+)', spreadsheet_url)
                    sheet_id = int(gid_match.group(1)) if gid_match else None
                    
                    # Загружаем каталог
                    data = get_google_sheets_data(spreadsheet_id, 'A1:K1500', sheet_id=sheet_id)
                    products = parse_shop_catalog_data(data)
                    
                    # Удаляем старые товары этого магазина
                    cursor.execute("DELETE FROM products WHERE shop_id = ?", (shop_id,))
                    
                    # Добавляем новые товары
                    for product in products:
                        # Пропускаем товары без названия
                        product_name = product.get('size_color')
                        if not product_name or not str(product_name).strip():
                            continue
                        
                        # Парсим цену
                        price_str = product.get('price', '')
                        price_num = None
                        if price_str:
                            price_match = re.search(r'(\d+(?:\.\d+)?)', str(price_str).replace(',', '.').replace(' ', ''))
                            if price_match:
                                try:
                                    price_num = float(price_match.group(1))
                                except:
                                    pass
                        
                        cursor.execute("""
                            INSERT INTO products (shop_id, product_name, category_path, price, price_numeric, photo_url, description, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            shop_id,
                            product_name,
                            product.get('category_path', ''),
                            product.get('price'),
                            price_num,
                            product.get('photo_url'),
                            product.get('description'),
                            datetime.now().isoformat()
                        ))
                    
                    # Обновляем статус
                    cursor.execute("""
                        INSERT OR REPLACE INTO catalog_updates (shop_id, last_updated, status)
                        VALUES (?, ?, 'success')
                    """, (shop_id, datetime.now().isoformat()))
                    
                    conn.commit()
        
        conn.close()
        
    except Exception as e:
        print(f"[CACHE ERROR] try_cache_one_shop failed: {e}")
        import traceback
        traceback.print_exc()


def get_google_sheets_data(spreadsheet_id, range_name='A2:I1500', sheet_id=None):
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╨┤╨░╨╜╨╜╤Л╤Е ╨╕╨╖ Google Sheets
    
    Args:
        spreadsheet_id: ID ╤В╨░╨▒╨╗╨╕╤Ж╤Л
        range_name: ╨Ф╨╕╨░╨┐╨░╨╖╨╛╨╜ ╨┤╨░╨╜╨╜╤Л╤Е
        sheet_id: ID ╨╗╨╕╤Б╤В╨░ (gid). ╨Х╤Б╨╗╨╕ None, ╤З╨╕╤В╨░╨╡╤В╤Б╤П ╨┐╨╡╤А╨▓╤Л╨╣ ╨╗╨╕╤Б╤В
    """
    # Проверяем кэш (защита от превышения Google Sheets API квоты 60 req/min)
    cache_key = f"{spreadsheet_id}:{sheet_id}:{range_name}"
    now = time.time()
    
    if cache_key in _sheets_cache:
        cached_data, cached_time = _sheets_cache[cache_key]
        if now - cached_time < SHEETS_CACHE_TTL:
            return cached_data
    
    try:
        client = get_gspread_client()
        spreadsheet = client.open_by_key(spreadsheet_id)
        
        # ╨Х╤Б╨╗╨╕ ╤Г╨║╨░╨╖╨░╨╜ sheet_id (gid), ╤З╨╕╤В╨░╨╡╨╝ ╨║╨╛╨╜╨║╤А╨╡╤В╨╜╤Л╨╣ ╨╗╨╕╤Б╤В
        if sheet_id is not None:
            sheet = spreadsheet.get_worksheet_by_id(int(sheet_id))
        else:
            # ╨Ш╨╜╨░╤З╨╡ ╤З╨╕╤В╨░╨╡╨╝ ╨┐╨╡╤А╨▓╤Л╨╣ ╨╗╨╕╤Б╤В
            sheet = spreadsheet.sheet1

        data = sheet.get(range_name)
        
        # Сохраняем в кэш
        _sheets_cache[cache_key] = (data, now)
        
        # Ограничиваем размер кэша (удаляем старые записи)
        if len(_sheets_cache) > 20:
            oldest_key = min(_sheets_cache.keys(), key=lambda k: _sheets_cache[k][1])
            del _sheets_cache[oldest_key]
        
        return data
    except Exception as e:
        print(f"ERROR in get_google_sheets_data: {e}")
        import traceback
        traceback.print_exc()
        return []


def parse_shop_catalog_data(data):
    """
    ╨Я╨░╤А╤Б╨╕╨╜╨│ ╨┤╨░╨╜╨╜╤Л╤Е ╨║╨░╤В╨░╨╗╨╛╨│╨░ ╨╝╨░╨│╨░╨╖╨╕╨╜╨░ ╤Б ╨┤╨╕╨╜╨░╨╝╨╕╤З╨╡╤Б╨║╨╛╨╣ ╨╕╨╡╤А╨░╤А╤Е╨╕╨╡╨╣ (╨┤╨╛ 7 ╤Г╤А╨╛╨▓╨╜╨╡╨╣)
    ╨б╤В╨╛╨╗╨▒╤Ж╤Л A-G: ╤Г╤А╨╛╨▓╨╜╨╕ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣ (╨┤╨╛ 7 ╤Г╤А╨╛╨▓╨╜╨╡╨╣)
    ╨б╤В╨╛╨╗╨▒╨╡╤Ж H: ╤А╨░╨╖╨╝╨╡╤А/╤Ж╨▓╨╡╤В
    ╨б╤В╨╛╨╗╨▒╨╡╤Ж I: ╤Ж╨╡╨╜╨░
    ╨б╤В╨╛╨╗╨▒╨╡╤Ж J: ╨╛╨┐╨╕╤Б╨░╨╜╨╕╨╡
    ╨б╤В╨╛╨╗╨▒╨╡╤Ж K: url ╤Д╨╛╤В╨╛
    """
    import re
    
    # ╨Я╤А╨╡╨┤╨║╨╛╨╝╨┐╨╕╨╗╨╕╤А╨╛╨▓╨░╨╜╨╜╤Л╨╡ regex ╨┤╨╗╤П ╤Б╨║╨╛╤А╨╛╤Б╤В╨╕
    drive_patterns = [
        re.compile(r'/file/d/([a-zA-Z0-9_-]+)'),
        re.compile(r'id=([a-zA-Z0-9_-]+)'),
        re.compile(r'/d/([a-zA-Z0-9_-]+)')
    ]
    
    def convert_google_drive_link(url):
        """╨Ъ╨╛╨╜╨▓╨╡╤А╤В╨░╤Ж╨╕╤П ╤Б╤Б╤Л╨╗╨║╨╕ Google Drive ╨▓ ╨┐╤А╤П╨╝╤Г╤О ╤Б╤Б╤Л╨╗╨║╤Г ╨╜╨░ ╨╕╨╖╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╨╡"""
        if not url or 'drive.google.com' not in url:
            return url
        
        # ╨Ш╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╨╝ ╨┐╤А╨╡╨┤╨║╨╛╨╝╨┐╨╕╨╗╨╕╤А╨╛╨▓╨░╨╜╨╜╤Л╨╡ patterns
        for pattern in drive_patterns:
            match = pattern.search(url)
            if match:
                file_id = match.group(1)
                # ╨Ш╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╨╝ thumbnail API ╨┤╨╗╤П ╨┐╨╛╨╗╤Г╤З╨╡╨╜╨╕╤П ╨╕╨╖╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╤П ╨▓╤Л╤Б╨╛╨║╨╛╨│╨╛ ╨║╨░╤З╨╡╤Б╤В╨▓╨░
                return f'https://drive.google.com/thumbnail?id={file_id}&sz=w2000-h2000'
        
        return url
    
    products = []  # ╨б╨┐╨╕╤Б╨╛╨║ ╨▓╤Б╨╡╤Е ╤В╨╛╨▓╨░╤А╨╛╨▓ ╤Б ╨┐╤Г╤В╤П╨╝╨╕ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣
    current_path = [''] * 7  # ╨в╨╡╨║╤Г╤Й╨╕╨╣ ╨┐╤Г╤В╤М ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣ (7 ╤Г╤А╨╛╨▓╨╜╨╡╨╣)
    
    # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡ ╤Б╤В╨╛╨╗╨▒╤Ж╨░ H ╨╕╨╖ ╨┐╨╡╤А╨▓╨╛╨╣ ╤Б╤В╤А╨╛╨║╨╕ (╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║)
    size_color_label = 'Размер/цвет'
    if len(data) > 0 and len(data[0]) > 7:
        header_value = data[0][7].strip() if data[0][7] else ''
        if header_value:
            size_color_label = header_value

    for i, row in enumerate(data):
        # ╨г╨╝╨╜╨░╤П ╨┐╤А╨╛╨▓╨╡╤А╨║╨░ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨░: ╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝ ╤В╨╛╨╗╤М╨║╨╛ ╨╡╤Б╨╗╨╕ ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ H ╤П╨▓╨╜╨╛ ╨╜╨░╨┐╨╕╤Б╨░╨╜ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║
        # (╨╜╨░╨┐╤А╨╕╨╝╨╡╤А "╨а╨░╨╖╨╝╨╡╤А", "Size", "╨ж╨▓╨╡╤В" ╨╕ ╤В.╨┤.) ╨Ш╨Ы╨Ш ╨╡╤Б╨╗╨╕ ╨╜╨╡╤В ╨┤╨░╨╜╨╜╤Л╤Е ╨╛ ╤В╨╛╨▓╨░╤А╨╡
        is_header = False
        if i == 0 and len(row) > 7:
            # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝, ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨╗╨╕ ╨┐╨╡╤А╨▓╨░╤П ╤Б╤В╤А╨╛╨║╨░ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╛╨╝
            h_value = row[7].strip().lower() if row[7] else ''
            # ╨Х╤Б╨╗╨╕ ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ H ╨╡╤Б╤В╤М ╤Б╨╗╨╛╨▓╨░ ╤В╨╕╨┐╨░ "╤А╨░╨╖╨╝╨╡╤А", "╤Ж╨▓╨╡╤В", "size" - ╤Н╤В╨╛ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║
            if any(keyword in h_value for keyword in ['размер', 'цвет', 'size', 'color', 'price', 'цена']):
                is_header = True
        
        if is_header:
            continue
            
        # ╨Ь╨╕╨╜╨╕╨╝╤Г╨╝ ╨╜╤Г╨╢╨╜╨░ ╤Е╨╛╤В╤П ╨▒╤Л ╨╛╨┤╨╜╨░ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П (╤Б╤В╨╛╨╗╨▒╨╡╤Ж A)
        if len(row) < 1:
            continue

        # ╨Ю╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ ╤В╨╡╨║╤Г╤Й╨╕╨╣ ╨┐╤Г╤В╤М ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣ (╤Б╤В╨╛╨╗╨▒╤Ж╤Л A-G, ╨╕╨╜╨┤╨╡╨║╤Б╤Л 0-6)
        for level in range(7):
            if len(row) > level and row[level]:
                current_path[level] = row[level].strip()
                # ╨б╨▒╤А╨░╤Б╤Л╨▓╨░╨╡╨╝ ╨▓╤Б╨╡ ╨┐╨╛╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╕╨╡ ╤Г╤А╨╛╨▓╨╜╨╕
                for next_level in range(level + 1, 7):
                    current_path[next_level] = ''

        # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝, ╨╡╤Б╤В╤М ╨╗╨╕ ╤Е╨╛╤В╤П ╨▒╤Л ╨╛╨┤╨╕╨╜ ╤Г╤А╨╛╨▓╨╡╨╜╤М ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕
        if not any(current_path):
            continue

        # ╨з╨╕╤В╨░╨╡╨╝ ╨┤╨░╨╜╨╜╤Л╨╡ ╤В╨╛╨▓╨░╤А╨░ (╤Б╤В╨╛╨╗╨▒╤Ж╤Л H-K, ╨╕╨╜╨┤╨╡╨║╤Б╤Л 7-10)
        size_color = row[7].strip() if len(row) > 7 and row[7] else None
        price = row[8].strip() if len(row) > 8 and row[8] else None
        description = row[9].strip() if len(row) > 9 and row[9] else None
        photo_url = row[10].strip() if len(row) > 10 and row[10] else None

        # ╨Ъ╨╛╨╜╨▓╨╡╤А╤В╨╕╤А╤Г╨╡╨╝ ╤Б╤Б╤Л╨╗╨║╤Г Google Drive ╨▓ ╨┐╤А╤П╨╝╤Г╤О ╤Б╤Б╤Л╨╗╨║╤Г
        if photo_url:
            photo_url = convert_google_drive_link(photo_url)

        # ╨Я╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝ ╤В╨╛╨╗╤М╨║╨╛ ╨╡╤Б╨╗╨╕ ╨╜╨╡╤В ╨▓╨╛╨╛╨▒╤Й╨╡ ╨╜╨╕╨║╨░╨║╨╕╤Е ╨┤╨░╨╜╨╜╤Л╤Е ╨╛ ╤В╨╛╨▓╨░╤А╨╡
        if not size_color and not price and not photo_url:
            continue

        # ╨б╨╛╨╖╨┤╨░╨╡╨╝ ╨┐╤Г╤В╤М ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕ ╨╕╨╖ ╨╜╨╡╨┐╤Г╤Б╤В╤Л╤Е ╤Г╤А╨╛╨▓╨╜╨╡╨╣
        category_path = ' > '.join([p for p in current_path if p])

        # ╨Ф╨╛╨▒╨░╨▓╨╗╤П╨╡╨╝ ╤В╨╛╨▓╨░╤А
        product = {
            'category_path': category_path,
            'size_color': size_color,
            'size_color_label': size_color_label,
            'price': price,
            'photo_url': photo_url,
            'description': description,
            'row_index': i + 2  # +2 ╨┐╨╛╤В╨╛╨╝╤Г ╤З╤В╨╛ ╤Б╤В╤А╨╛╨║╨╕ ╨╜╨░╤З╨╕╨╜╨░╤О╤В╤Б╤П ╤Б 1 ╨╕ ╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║
        }
        
        products.append(product)

    return products


def sync_shops_from_table():
    """╨Т╤Б╨┐╨╛╨╝╨╛╨│╨░╤В╨╡╨╗╤М╨╜╨░╤П ╤Д╤Г╨╜╨║╤Ж╨╕╤П ╤Б╨╕╨╜╤Е╤А╨╛╨╜╨╕╨╖╨░╤Ж╨╕╨╕ ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓"""
    data = get_google_sheets_data(MAIN_SPREADSHEET_ID, 'A1:I1000')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨▓╤Б╨╡ ID ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨╕╨╖ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
    table_shop_ids = set()
    shops_data = []
    current_city = 'Не установлен'  # ╨У╨╛╤А╨╛╨┤ ╨┐╨╛ ╤Г╨╝╨╛╨╗╤З╨░╨╜╨╕╤О
    current_category = 'Без категории'  # ╨Ъ╨░╤В╨╡╨│╨╛╤А╨╕╤П ╨┐╨╛ ╤Г╨╝╨╛╨╗╤З╨░╨╜╨╕╤О
    
    for i, row in enumerate(data):
        # ╨Я╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝ ╤Б╤В╤А╨╛╨║╤Г ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╛╨▓ (╨┐╨╡╤А╨▓╨░╤П ╤Б╤В╤А╨╛╨║╨░)
        if i == 0 or (len(row) > 0 and row[0] and row[0].strip().lower() in ['город', 'city']):
            continue
        
        # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║ ╨│╨╛╤А╨╛╨┤╨░/╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕ (A ╨╕ B ╨╖╨░╨┐╨╛╨╗╨╜╨╡╨╜╤Л, ╨╜╨╛ C ╨┐╤Г╤Б╤В╨╛╨╡)
        if len(row) >= 2:
            city_value = row[0].strip() if row[0] else ''
            category_value = row[1].strip() if row[1] else ''
            name_value = row[2].strip() if len(row) > 2 and row[2] else ''
            
            # ╨Х╤Б╨╗╨╕ ╨╜╨╡╤В ╨╜╨░╨╖╨▓╨░╨╜╨╕╤П (C ╨┐╤Г╤Б╤В╨╛), ╤Н╤В╨╛ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║
            if not name_value and (city_value or category_value):
                if city_value:
                    current_city = city_value.capitalize()
                if category_value:
                    current_category = category_value
                continue
        
        # ╨Я╨░╤А╤Б╨╕╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜: C=╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡, D=╤В╨░╨▒╨╗╨╕╤Ж╨░, E=ID, F=2╨│╨╕╤Б, G=╨╛╨┐╨╕╤Б╨░╨╜╨╕╨╡, H=╤Д╨╛╤В╨╛
        if len(row) >= 5 and row[2] and row[4]:  # row[2]=╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡, row[4]=ID
            shop_name = row[2]  # C=╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡
            spreadsheet_url = row[3] if len(row) > 3 else ''  # D=╨б╤Б╤Л╨╗╨║╨░ ╨╜╨░ ╤В╨░╨▒╨╗╨╕╤Ж╤Г
            shop_id = row[4]  # E=ID
            gis_url = row[5] if len(row) > 5 else ''  # F=2╨У╨Ш╨б
            description = row[6] if len(row) > 6 else ''  # G=╨Ю╨┐╨╕╤Б╨░╨╜╨╕╨╡
            photo_url = row[7].strip() if len(row) > 7 and row[7] else None  # H=╨д╨╛╤В╨╛
            
            # ╨Я╨░╤А╤Б╨╕╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨╕╨╖ ╤Б╤Б╤Л╨╗╨║╨╕ 2╨У╨Ш╨б
            import re
            latitude, longitude = 0.0, 0.0
            city = current_city  # ╨Ш╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╨╝ ╤В╨╡╨║╤Г╤Й╨╕╨╣ ╨│╨╛╤А╨╛╨┤ ╨╕╨╖ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨░
            
            if gis_url:  # ╨б╤Б╤Л╨╗╨║╨░ 2╨У╨Ш╨б ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ F (╨╕╨╜╨┤╨╡╨║╤Б 5)
                # ╨Ш╤Й╨╡╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨▓ ╤Д╨╛╤А╨╝╨░╤В╨╡ m=╨┤╨╛╨╗╨│╨╛╤В╨░,╤И╨╕╤А╨╛╤В╨░
                coords_match = re.search(r'm=([0-9.]+)(?:%2C|,)([0-9.]+)', gis_url)
                if coords_match:
                    longitude = float(coords_match.group(1))
                    latitude = float(coords_match.group(2))
                    # ╨Х╤Б╨╗╨╕ ╨│╨╛╤А╨╛╨┤ ╨╜╨╡ ╨╖╨░╨┤╨░╨╜ ╨▓ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╡, ╨┐╤Л╤В╨░╨╡╨╝╤Б╤П ╨╕╨╖╨▓╨╗╨╡╤З╤М ╨╕╨╖ ╤Б╤Б╤Л╨╗╨║╨╕
                    if city == 'Не установлен':
                        city_match = re.search(r'2gis\.ru/([^/]+)/', gis_url)
                        if city_match:
                            city_eng = city_match.group(1).lower()
                            city = CITY_TRANSLATION.get(city_eng, city_match.group(1).capitalize())
            
            table_shop_ids.add(shop_id)
            shops_data.append({
                'shop_id': shop_id,
                'shop_name': shop_name,
                'spreadsheet_url': spreadsheet_url,
                'city': city,
                'latitude': latitude,
                'longitude': longitude,
                'photo_url': photo_url,
                'category': current_category,
                'description': description
            })
    
    # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨▓╤Б╨╡ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л ╨╕╨╖ ╨С╨Ф
    cursor.execute('SELECT shop_id FROM shops')
    db_shop_ids = set(row[0] for row in cursor.fetchall())
    
    # ╨г╨┤╨░╨╗╤П╨╡╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л, ╨║╨╛╤В╨╛╤А╤Л╤Е ╨╜╨╡╤В ╨▓ ╤В╨░╨▒╨╗╨╕╤Ж╨╡
    shops_to_delete = db_shop_ids - table_shop_ids
    for shop_id in shops_to_delete:
        cursor.execute('DELETE FROM shops WHERE shop_id = ?', (shop_id,))
    
    # ╨Ф╨╛╨▒╨░╨▓╨╗╤П╨╡╨╝/╨╛╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л ╨╕╨╖ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
    for shop in shops_data:
        cursor.execute('''
            INSERT OR REPLACE INTO shops (shop_id, shop_name, city, latitude, longitude, spreadsheet_url, photo_url, category, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (shop['shop_id'], shop['shop_name'], shop['city'], 
              shop['latitude'], shop['longitude'], shop['spreadsheet_url'], shop.get('photo_url'), shop['category'], shop.get('description', '')))
    
    conn.commit()
    conn.close()


@app.route('/api/cities', methods=['GET'])
def get_cities():
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╤Б╨┐╨╕╤Б╨║╨░ ╨▓╤Б╨╡╤Е ╨│╨╛╤А╨╛╨┤╨╛╨▓ ╨а╨╛╤Б╤Б╨╕╨╕ ╨┤╨╗╤П ╨║╨░╤А╤В╤Л (╤Б╤В╨░╤В╨╕╤З╨╡╤Б╨║╨╕╨╣ ╤Б╨┐╨╕╤Б╨╛╨║ + ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л)"""
    try:
        # ╨Ъ╤А╤Г╨┐╨╜╤Л╨╡ ╨│╨╛╤А╨╛╨┤╨░ ╨а╨╛╤Б╤Б╨╕╨╕ (300╨║+ ╨╜╨░╤Б╨╡╨╗╨╡╨╜╨╕╨╡)
        RUSSIA_CITIES = [
            {"name": "Тюмень", "lat": 57.1522, "lng": 65.5272},
            {"name": "Ишим", "lat": 56.1127, "lng": 69.4878},
            {"name": "Заводоуковск", "lat": 56.5068, "lng": 66.5508},
            {"name": "Североуральск", "lat": 60.1572, "lng": 59.9522},
            {"name": "Ивдель", "lat": 60.6925, "lng": 60.4278},
            {"name": "Москва", "lat": 55.7558, "lng": 37.6173},
            {"name": "Санкт-Петербург", "lat": 59.9343, "lng": 30.3351},
            {"name": "Новосибирск", "lat": 55.0084, "lng": 82.9357},
            {"name": "Екатеринбург", "lat": 56.8389, "lng": 60.6057},
            {"name": "Казань", "lat": 55.8304, "lng": 49.0661},
            {"name": "Нижний Новгород", "lat": 56.2965, "lng": 43.9361},
            {"name": "Челябинск", "lat": 55.1644, "lng": 61.4368},
            {"name": "Самара", "lat": 53.2001, "lng": 50.1500},
            {"name": "Омск", "lat": 54.9885, "lng": 73.3242},
            {"name": "Ростов-на-Дону", "lat": 47.2357, "lng": 39.7015},
            {"name": "Уфа", "lat": 54.7388, "lng": 55.9721},
            {"name": "Красноярск", "lat": 56.0153, "lng": 92.8932},
            {"name": "Воронеж", "lat": 51.6605, "lng": 39.2005},
            {"name": "Пермь", "lat": 58.0105, "lng": 56.2502},
            {"name": "Волгоград", "lat": 48.7080, "lng": 44.5133},
            {"name": "Краснодар", "lat": 45.0355, "lng": 38.9753},
            {"name": "Саратов", "lat": 51.5924, "lng": 46.0348},
            {"name": "Тольятти", "lat": 53.5303, "lng": 49.3461},
            {"name": "Ижевск", "lat": 56.8519, "lng": 53.2048},
            {"name": "Барнаул", "lat": 53.3547, "lng": 83.7697},
            {"name": "Ульяновск", "lat": 54.3142, "lng": 48.4031},
            {"name": "Иркутск", "lat": 52.2869, "lng": 104.3050},
            {"name": "Хабаровск", "lat": 48.4827, "lng": 135.0838},
            {"name": "Ярославль", "lat": 57.6261, "lng": 39.8845},
            {"name": "Владивосток", "lat": 43.1332, "lng": 131.9113},
            {"name": "Махачкала", "lat": 42.9849, "lng": 47.5047},
            {"name": "Томск", "lat": 56.4977, "lng": 84.9744},
            {"name": "Оренбург", "lat": 51.7727, "lng": 55.0988},
            {"name": "Кемерово", "lat": 55.3547, "lng": 86.0586},
            {"name": "Новокузнецк", "lat": 53.7596, "lng": 87.1216},
            {"name": "Рязань", "lat": 54.6269, "lng": 39.6916},
            {"name": "Астрахань", "lat": 46.3497, "lng": 48.0408},
            {"name": "Набережные Челны", "lat": 55.7430, "lng": 52.3977},
            {"name": "Пенза", "lat": 53.2007, "lng": 45.0046},
            {"name": "Киров", "lat": 58.6035, "lng": 49.6680},
            {"name": "Липецк", "lat": 52.6103, "lng": 39.5698},
            {"name": "Чебоксары", "lat": 56.1439, "lng": 47.2489},
            {"name": "Калининград", "lat": 54.7104, "lng": 20.4522},
            {"name": "Тула", "lat": 54.1961, "lng": 37.6182},
            {"name": "Курск", "lat": 51.7373, "lng": 36.1873},
            {"name": "Ставрополь", "lat": 45.0428, "lng": 41.9734},
            {"name": "Сочи", "lat": 43.6028, "lng": 39.7342},
            {"name": "Улан-Удэ", "lat": 51.8272, "lng": 107.6063},
            {"name": "Тверь", "lat": 56.8587, "lng": 35.9176},
            {"name": "Магнитогорск", "lat": 53.4117, "lng": 58.9794},
            {"name": "Иваново", "lat": 57.0000, "lng": 40.9737},
            {"name": "Брянск", "lat": 53.2521, "lng": 34.3717},
            {"name": "Белгород", "lat": 50.5997, "lng": 36.5982},
            {"name": "Нижний Тагил", "lat": 57.9197, "lng": 59.9650},
            {"name": "Архангельск", "lat": 64.5401, "lng": 40.5433},
            {"name": "Владимир", "lat": 56.1366, "lng": 40.3966},
            {"name": "Калуга", "lat": 54.5293, "lng": 36.2754},
            {"name": "Чита", "lat": 52.0330, "lng": 113.4994},
            {"name": "Смоленск", "lat": 54.7818, "lng": 32.0401},
            {"name": "Волжский", "lat": 48.7854, "lng": 44.7511},
            {"name": "Курган", "lat": 55.4500, "lng": 65.3333},
            {"name": "Череповец", "lat": 59.1333, "lng": 37.9000},
            {"name": "Орёл", "lat": 52.9651, "lng": 36.0785},
            {"name": "Вологда", "lat": 59.2239, "lng": 39.8843},
            {"name": "Мурманск", "lat": 68.9585, "lng": 33.0827},
            {"name": "Петрозаводск", "lat": 61.7849, "lng": 34.3469},
            {"name": "Сыктывкар", "lat": 61.6681, "lng": 50.8067},
            {"name": "Северодвинск", "lat": 64.5635, "lng": 39.8302},
            {"name": "Великий Новгород", "lat": 58.5213, "lng": 31.2751},
            {"name": "Псков", "lat": 57.8136, "lng": 28.3496},
            {"name": "Петропавловск-Камчатский", "lat": 53.0245, "lng": 158.6433},
            {"name": "Норильск", "lat": 69.3558, "lng": 88.1893},
            {"name": "Нарьян-Мар", "lat": 67.6380, "lng": 53.0069},
            {"name": "Салехард", "lat": 66.5297, "lng": 66.6014},
            {"name": "Якутск", "lat": 62.0355, "lng": 129.6755},
            {"name": "Благовещенск", "lat": 50.2666, "lng": 127.5278},
            {"name": "Южно-Сахалинск", "lat": 46.9590, "lng": 142.7386},
            {"name": "Магадан", "lat": 59.5638, "lng": 150.8027},
            {"name": "Комсомольск-на-Амуре", "lat": 50.5497, "lng": 137.0078},
            {"name": "Находка", "lat": 42.8133, "lng": 132.8735},
            {"name": "Абакан", "lat": 53.7215, "lng": 91.4425},
            {"name": "Братск", "lat": 56.1515, "lng": 101.6140},
            {"name": "Ангарск", "lat": 52.5406, "lng": 103.8886},
            {"name": "Усть-Илимск", "lat": 58.0006, "lng": 102.6617},
            {"name": "Анадырь", "lat": 64.7339, "lng": 177.5080},
            {"name": "Южно-Курильск", "lat": 44.0298, "lng": 145.8649}
        ]
        
        return jsonify({'cities': RUSSIA_CITIES})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/categories', methods=['GET'])
def get_categories():
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╤Б╨┐╨╕╤Б╨║╨░ ╨▓╤Б╨╡╤Е ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT DISTINCT category 
            FROM shops 
            WHERE category IS NOT NULL
            ORDER BY category
        ''')
        
        categories = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({'categories': categories})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/categories/<city>', methods=['GET'])
def get_categories_by_city(city):
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╣ ╨┤╨╗╤П ╨║╨╛╨╜╨║╤А╨╡╤В╨╜╨╛╨│╨╛ ╨│╨╛╤А╨╛╨┤╨░"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT DISTINCT category 
            FROM shops 
            WHERE city = ? AND category IS NOT NULL
            ORDER BY category
        ''', (city,))
        
        categories = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({'categories': categories})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/shops/<city>', methods=['GET'])
@app.route('/api/shops/<city>', methods=['GET'])
@rate_limit(max_requests=50, window_seconds=60)
def get_shops_by_city(city):
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨┐╨╛ ╨│╨╛╤А╨╛╨┤╤Г"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT shop_id, shop_name, latitude, longitude, spreadsheet_url, photo_url, category, description
            FROM shops 
            WHERE city = ?
        ''', (city,))
        
        shops = []
        for row in cursor.fetchall():
            shops.append({
                'shop_id': row[0],
                'name': row[1],
                'latitude': row[2],
                'longitude': row[3],
                'spreadsheet_url': row[4],
                'photo_url': row[5],
                'category': row[6] if len(row) > 6 else '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕',
                'description': row[7] if len(row) > 7 else ''
            })
        
        conn.close()
        
        return jsonify({'shops': shops})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/all-shops', methods=['GET'])
def get_all_shops():
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╨Т╨б╨Х╨е ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨╕╨╖ SQLite (╨║╤Н╤И) ╨╕╨╗╨╕ Google Sheets"""
    try:
        # Проверяем параметр force_refresh для принудительного обновления
        force_refresh = request.args.get('force_refresh') == 'true'
        
        # ╨б╨╜╨░╤З╨░╨╗╨░ ╨┐╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ SQLite ╨║╤Н╤И
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╨╡╤Б╤В╤М ╨╗╨╕ ╨┤╨░╨╜╨╜╤Л╨╡ ╨▓ SQLite (╨╛╨▒╨╜╨╛╨▓╨╗╤П╨╗╨╕╤Б╤М ╨╗╨╕ ╨╖╨░ ╨┐╨╛╤Б╨╗╨╡╨┤╨╜╨╕╨╡ 5 ╨╝╨╕╨╜╤Г╤В)
        cursor.execute("SELECT COUNT(*), MAX(updated_at) FROM shops")
        count, last_update = cursor.fetchone()
        
        now = datetime.now()
        cache_valid = False
        
        if count and count > 0 and last_update and not force_refresh:
            try:
                last_update_dt = datetime.fromisoformat(last_update)
                cache_valid = (now - last_update_dt).total_seconds() < 300  # 5 ╨╝╨╕╨╜╤Г╤В
            except:
                cache_valid = False
        
        if cache_valid:
            # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝, ╨╡╤Б╤В╤М ╨╗╨╕ ╨║╨╛╨╗╨╛╨╜╨║╨░ description
            cursor.execute("PRAGMA table_info(shops)")
            columns = [col[1] for col in cursor.fetchall()]
            has_description = 'description' in columns
            
            if has_description:
                cursor.execute("""
                    SELECT shop_id, shop_name, city, latitude, longitude, 
                           spreadsheet_url, photo_url, category, description
                    FROM shops
                """)
            else:
                cursor.execute("""
                    SELECT shop_id, shop_name, city, latitude, longitude, 
                           spreadsheet_url, photo_url, category
                    FROM shops
                """)
            
            rows = cursor.fetchall()
            conn.close()
            
            shops = []
            for row in rows:
                shop_dict = {
                    'shop_id': row[0],
                    'name': row[1],
                    'city': row[2],
                    'latitude': row[3],
                    'longitude': row[4],
                    'spreadsheet_url': row[5],
                    'photo_url': row[6],
                    'category': row[7],
                    'description': row[8] if (has_description and len(row) > 8) else ''
                }
                shops.append(shop_dict)
            
            return jsonify({'shops': shops})
        
        conn.close()
        
        # Если кэш невалиден - загружаем из Google Sheets
        # Используем кэшированную функцию для чтения данных
        # Расширяем диапазон до I, чтобы захватить все возможные данные
        rows = get_google_sheets_data(MAIN_SPREADSHEET_ID, 'A1:I501')[1:]  # Пропускаем заголовок
        
        shops = []
        current_category = ""  # ╨в╨╡╨║╤Г╤Й╨░╤П ╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П (╨╖╨░╨┐╨╛╨╝╨╕╨╜╨░╨╡╨╝)
        current_city = ""  # ╨в╨╡╨║╤Г╤Й╨╕╨╣ ╨│╨╛╤А╨╛╨┤ (╨╖╨░╨┐╨╛╨╝╨╕╨╜╨░╨╡╨╝)
        
        for row in rows:
            # ╨з╨╕╤В╨░╨╡╨╝ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨╕╨╖ ╤Б╤В╨╛╨╗╨▒╤Ж╨╛╨▓
            # A=╨У╨╛╤А╨╛╨┤, B=╨Ъ╨░╤В╨╡╨│╨╛╤А╨╕╤П, C=╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡, D=╨б╤Б╤Л╨╗╨║╨░ ╨╜╨░ ╤В╨░╨▒╨╗╨╕╤Ж╤Г, E=ID, F=2╨У╨Ш╨б, G=╨Ю╨┐╨╕╤Б╨░╨╜╨╕╨╡, H=╨д╨╛╤В╨╛
            city_value = row[0].strip() if len(row) > 0 and row[0] else ""
            category_value = row[1].strip() if len(row) > 1 and row[1] else ""
            name = row[2].strip() if len(row) > 2 and row[2] else ""
            spreadsheet_url = row[3].strip() if len(row) > 3 and row[3] else ""
            shop_id = row[4].strip() if len(row) > 4 and row[4] else ""
            gis_url = row[5].strip() if len(row) > 5 and row[5] else ""
            description = row[6].strip() if len(row) > 6 and row[6] else ""
            photo_url = row[7].strip() if len(row) > 7 and row[7] else ""
            
            # ╨Я╤А╨╛╨▓╨╡╤А╨║╨░ ╨╜╨░ ╤Б╤В╤А╨╛╨║╤Г ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨░ (╨│╨╛╤А╨╛╨┤+╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П ╨╕╨╗╨╕ ╤В╨╛╨╗╤М╨║╨╛ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П, ╨╜╨╛ ╨С╨Х╨Ч ID)
            # ╨Х╤Б╨╗╨╕ ╤Н╤В╨╛ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║ - ╨╛╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ current_city/current_category ╨╕ ╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝
            if not shop_id:
                # ╨б╤В╤А╨╛╨║╨░ ╨▒╨╡╨╖ ID - ╤Д╤В╨╛ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨╛╨║ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕/╨│╨╛╤А╨╛╨┤╨░
                if city_value:
                    current_city = city_value.title()  # title() делает каждое слово с большой буквы
                if category_value:
                    current_category = category_value
                continue
            
            # ╨Х╤Б╨╗╨╕ ╨╡╤Б╤В╤М ID ╨╜╨╛ ╨╜╨╡╤В ╨╜╨░╨╖╨▓╨░╨╜╨╕╤П - ╨╛╤И╨╕╨▒╨║╨░ ╨▓ ╤В╨░╨▒╨╗╨╕╤Ж╨╡
            if not name:
                continue
            
            # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╤Л╨╡ ╨┐╨╛╨╗╤П ╨┤╨╗╤П ╨╝╨░╨│╨░╨╖╨╕╨╜╨░
            if not current_city:
                continue
            
            # ╨Я╨░╤А╤Б╨╕╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨╕╨╖ ╤Б╤Б╤Л╨╗╨║╨╕ 2╨У╨Ш╨б
            import re
            latitude, longitude = 0.0, 0.0
            
            if gis_url:
                coords_match = re.search(r'm=([0-9.]+)(?:%2C|,)([0-9.]+)', gis_url)
                if coords_match:
                    longitude = float(coords_match.group(1))
                    latitude = float(coords_match.group(2))
            
            shops.append({
                'city': current_city,
                'category': current_category if current_category else '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕',
                'name': name,
                'shop_id': shop_id,
                'spreadsheet_url': spreadsheet_url,
                'description': description,
                'photo_url': photo_url,
                'latitude': latitude,
                'longitude': longitude
            })
        
        # ╨б╨╛╤Е╤А╨░╨╜╤П╨╡╨╝ ╨▓ SQLite ╨┤╨╗╤П ╨║╤Н╤И╨╕╤А╨╛╨▓╨░╨╜╨╕╤П
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # ╨Ю╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ timestamp ╨┤╨╗╤П ╨▓╤Б╨╡╤Е ╨╖╨░╨┐╨╕╤Б╨╡╨╣
        now_str = now.isoformat()
        for shop in shops:
            cursor.execute("""
                INSERT OR REPLACE INTO shops 
                (shop_id, shop_name, city, latitude, longitude, spreadsheet_url, photo_url, category, description, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                shop['shop_id'], shop['name'], shop['city'],
                shop['latitude'], shop['longitude'], shop['spreadsheet_url'],
                shop.get('photo_url'), shop['category'], shop.get('description', ''), now_str
            ))
        
        conn.commit()
        conn.close()
        
        # Возвращаем результат (не очищаем shops, т.к. jsonify использует ссылку)
        return jsonify({
            'shops': shops,
            'total': len(shops)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/shop/<shop_id>', methods=['GET'])
def get_shop_info(shop_id):
    """╨Я╨╛╨╗╤Г╤З╨╡╨╜╨╕╨╡ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╕ ╨╛ ╨╝╨░╨│╨░╨╖╨╕╨╜╨╡"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT shop_name, city, spreadsheet_url, description
            FROM shops 
            WHERE shop_id = ?
        ''', (shop_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'error': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜'}), 404
        
        return jsonify({
            'name': row[0],
            'city': row[1],
            'spreadsheet_url': row[2],
            'description': row[3] if len(row) > 3 else ''
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/shop/<shop_id>/catalog', methods=['GET'])
def get_shop_catalog(shop_id):
    """Получение каталога магазина из кэша products"""
    # Попытка закэшировать один магазин
    try:
        try_cache_one_shop()
    except:
        pass
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Сначала проверяем есть ли данные в кэше
        cursor.execute("""
            SELECT product_name, category_path, price, photo_url, description
            FROM products
            WHERE shop_id = ?
        """, (shop_id,))
        
        rows = cursor.fetchall()
        
        # Если в кэше пусто, загружаем напрямую из Google Sheets
        if not rows:
            # Получаем URL таблицы магазина
            cursor.execute("SELECT spreadsheet_url FROM shops WHERE shop_id = ?", (shop_id,))
            shop_row = cursor.fetchone()
            
            if not shop_row or not shop_row[0]:
                conn.close()
                return jsonify({'error': 'Магазин не найден'}), 404
            
            spreadsheet_url = shop_row[0]
            
            # Извлекаем ID таблицы и gid
            import re
            match = re.search(r'/d/([a-zA-Z0-9-_]+)', spreadsheet_url)
            if not match:
                conn.close()
                return jsonify({'error': 'Неверный формат URL таблицы'}), 400
            
            spreadsheet_id = match.group(1)
            gid_match = re.search(r'[?#&]gid=([0-9]+)', spreadsheet_url)
            sheet_id = int(gid_match.group(1)) if gid_match else None
            
            # Загружаем из Google Sheets
            data = get_google_sheets_data(spreadsheet_id, 'A1:K1500', sheet_id=sheet_id)
            products = parse_shop_catalog_data(data)
            
            conn.close()
            return jsonify({'products': products})
        
        # Формируем ответ из кэша
        products = []
        for row in rows:
            product_name, category_path, price, photo_url, description = row
            products.append({
                'size_color': product_name,
                'category_path': category_path,
                'price': price,
                'photo_url': photo_url,
                'description': description
            })
        
        conn.close()
        return jsonify({'products': products})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/shops', methods=['POST'])
def admin_add_shop():
    """╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨╝╨░╨│╨░╨╖╨╕╨╜╨░ ╨░╨┤╨╝╨╕╨╜╨╕╤Б╤В╤А╨░╤В╨╛╤А╨╛╨╝"""
    try:
        data = request.json
        
        # ╨Т╨░╨╗╨╕╨┤╨░╤Ж╨╕╤П ╨┤╨░╨╜╨╜╤Л╤Е
        required_fields = ['shop_id', 'shop_name', 'city', 'latitude', 'longitude', 'spreadsheet_url']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'╨Ю╤В╤Б╤Г╤В╤Б╤В╨▓╤Г╨╡╤В ╨┐╨╛╨╗╨╡ {field}'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO shops (shop_id, shop_name, city, latitude, longitude, spreadsheet_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (data['shop_id'], data['shop_name'], data['city'], 
              data['latitude'], data['longitude'], data['spreadsheet_url']))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╤Г╤Б╨┐╨╡╤И╨╜╨╛ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/shops/<shop_id>', methods=['DELETE'])
def admin_delete_shop(shop_id):
    """╨г╨┤╨░╨╗╨╡╨╜╨╕╨╡ ╨╝╨░╨│╨░╨╖╨╕╨╜╨░ ╨░╨┤╨╝╨╕╨╜╨╕╤Б╤В╤А╨░╤В╨╛╤А╨╛╨╝"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM shops WHERE shop_id = ?', (shop_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╤Г╤Б╨┐╨╡╤И╨╜╨╛ ╤Г╨┤╨░╨╗╨╡╨╜'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/sync-shop/<shop_id>', methods=['POST'])
def admin_sync_single_shop(shop_id):
    """╨б╨╕╨╜╤Е╤А╨╛╨╜╨╕╨╖╨░╤Ж╨╕╤П ╨╛╨┤╨╜╨╛╨│╨╛ ╨╝╨░╨│╨░╨╖╨╕╨╜╨░ ╨┐╨╛ ID ╨╕╨╖ ╨│╨╗╨░╨▓╨╜╨╛╨╣ ╤В╨░╨▒╨╗╨╕╤Ж╤Л"""
    try:
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨┤╨░╨╜╨╜╤Л╨╡ ╨╕╨╖ ╨│╨╗╨░╨▓╨╜╨╛╨╣ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
        data = get_google_sheets_data(MAIN_SPREADSHEET_ID, 'A2:F1000')
        
        shop_found = None
        for row in data:
            if len(row) >= 4 and row[3] == shop_id:  # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ID ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ D
                # ╨Я╨░╤А╤Б╨╕╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨╕╨╖ ╤Б╤Б╤Л╨╗╨║╨╕ 2╨У╨Ш╨б
                import re
                from urllib.parse import unquote
                latitude, longitude, city = 0.0, 0.0, '╨Э╨╡ ╤Г╤Б╤В╨░╨╜╨╛╨▓╨╗╨╡╨╜'
                
                if len(row) > 4 and row[4]:  # ╨б╤Б╤Л╨╗╨║╨░ 2╨У╨Ш╨б ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ E
                    # ╨д╨╛╤А╨╝╨░╤В 2╨У╨Ш╨б: m=longitude,latitude/zoom
                    coords_match = re.search(r'm=([0-9.]+)(?:%2C|,)([0-9.]+)', row[4])
                    if coords_match:
                        longitude = float(coords_match.group(1))
                        latitude = float(coords_match.group(2))
                        # ╨Ю╨┐╤А╨╡╨┤╨╡╨╗╤П╨╡╨╝ ╨│╨╛╤А╨╛╨┤ ╨╕╨╖ URL
                        city_match = re.search(r'2gis\.ru/([^/]+)/', row[4])
                        if city_match:
                            city_name = city_match.group(1)
                            city = city_name.capitalize()
                        else:
                            city = '╨Э╨╡ ╤Г╤Б╤В╨░╨╜╨╛╨▓╨╗╨╡╨╜'
                
                shop_found = {
                    'shop_id': row[3],
                    'shop_name': row[1],
                    'spreadsheet_url': row[2] if len(row) > 2 else '',
                    'city': city,
                    'latitude': latitude,
                    'longitude': longitude
                }
                break
        
        if not shop_found:
            return jsonify({'error': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╤Б ╤В╨░╨║╨╕╨╝ ID ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜ ╨▓ ╤В╨░╨▒╨╗╨╕╤Ж╨╡'}), 404
        
        # ╨Ф╨╛╨▒╨░╨▓╨╗╤П╨╡╨╝/╨╛╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜ ╨▓ ╨С╨Ф
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO shops (shop_id, shop_name, city, latitude, longitude, spreadsheet_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (shop_found['shop_id'], shop_found['shop_name'], shop_found['city'], 
              shop_found['latitude'], shop_found['longitude'], shop_found['spreadsheet_url']))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╤Б╨╕╨╜╤Е╤А╨╛╨╜╨╕╨╖╨╕╤А╨╛╨▓╨░╨╜', 'shop_name': shop_found['shop_name']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/sync', methods=['POST'])
def admin_sync_shops():
    """╨б╨╕╨╜╤Е╤А╨╛╨╜╨╕╨╖╨░╤Ж╨╕╤П ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨╕╨╖ ╨│╨╗╨░╨▓╨╜╨╛╨╣ ╤В╨░╨▒╨╗╨╕╤Ж╤Л"""
    try:
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨┤╨░╨╜╨╜╤Л╨╡ ╨╕╨╖ ╨│╨╗╨░╨▓╨╜╨╛╨╣ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
        data = get_google_sheets_data(MAIN_SPREADSHEET_ID, 'A1:G1000')
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨▓╤Б╨╡ ID ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨╕╨╖ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
        table_shop_ids = set()
        shops_data = []
        current_category = '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕'  # ╨Ъ╨░╤В╨╡╨│╨╛╤А╨╕╤П ╨┐╨╛ ╤Г╨╝╨╛╨╗╤З╨░╨╜╨╕╤О
        
        for i, row in enumerate(data):
            # ╨Я╤А╨╛╨┐╤Г╤Б╨║╨░╨╡╨╝ ╤Б╤В╤А╨╛╨║╤Г ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╛╨▓ (╨┐╨╡╤А╨▓╨░╤П ╤Б╤В╤А╨╛╨║╨░)
            if i == 0 or (len(row) > 0 and row[0] and row[0].strip().lower() in ['id', 'тДЦ', '╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П', 'kategoria']):
                continue
            
            # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝, ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨╗╨╕ ╤Б╤В╤А╨╛╨║╨░ ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╛╨╝ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕
            if len(row) >= 1 and row[0] and row[0].strip():
                # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╤З╤В╨╛ ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ B ╨╜╨╡╤В ╨┤╨░╨╜╨╜╤Л╤Е
                if len(row) < 2 or not row[1] or not row[1].strip():
                    # ╨н╤В╨╛ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╤П
                    current_category = row[0].strip()

                shop_id = row[3]
                shop_name = row[1]
                spreadsheet_url = row[2] if len(row) > 2 else ''
                photo_url = row[6].strip() if len(row) > 6 and row[6] else None
                
                # ╨Я╨░╤А╤Б╨╕╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨╕╨╖ ╤Б╤Б╤Л╨╗╨║╨╕ 2╨У╨Ш╨б
                import re
                latitude, longitude, city = 0.0, 0.0, '╨Э╨╡ ╤Г╤Б╤В╨░╨╜╨╛╨▓╨╗╨╡╨╜'
                
                if len(row) > 4 and row[4]:  # ╨б╤Б╤Л╨╗╨║╨░ 2╨У╨Ш╨б ╨▓ ╤Б╤В╨╛╨╗╨▒╤Ж╨╡ E
                    coords_match = re.search(r'm=([0-9.]+)(?:%2C|,)([0-9.]+)', row[4])
                    if coords_match:
                        longitude = float(coords_match.group(1))
                        latitude = float(coords_match.group(2))
                        city_match = re.search(r'2gis\.ru/([^/]+)/', row[4])
                        if city_match:
                            city_eng = city_match.group(1).lower()
                            city = CITY_TRANSLATION.get(city_eng, city_match.group(1).capitalize())
                
                table_shop_ids.add(shop_id)
                shops_data.append({
                    'shop_id': shop_id,
                    'shop_name': shop_name,
                    'spreadsheet_url': spreadsheet_url,
                    'city': city,
                    'latitude': latitude,
                    'longitude': longitude,
                    'photo_url': photo_url,
                    'category': current_category
                })
        
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╨▓╤Б╨╡ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л ╨╕╨╖ ╨С╨Ф
        cursor.execute('SELECT shop_id FROM shops')
        db_shop_ids = set(row[0] for row in cursor.fetchall())
        
        # ╨г╨┤╨░╨╗╤П╨╡╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л, ╨║╨╛╤В╨╛╤А╤Л╤Е ╨╜╨╡╤В ╨▓ ╤В╨░╨▒╨╗╨╕╤Ж╨╡
        shops_to_delete = db_shop_ids - table_shop_ids
        deleted_count = 0
        for shop_id in shops_to_delete:
            cursor.execute('DELETE FROM shops WHERE shop_id = ?', (shop_id,))
            deleted_count += 1
        
        # ╨Ф╨╛╨▒╨░╨▓╨╗╤П╨╡╨╝/╨╛╨▒╨╜╨╛╨▓╨╗╤П╨╡╨╝ ╨╝╨░╨│╨░╨╖╨╕╨╜╤Л ╨╕╨╖ ╤В╨░╨▒╨╗╨╕╤Ж╤Л
        synced_count = 0
        for shop in shops_data:
            cursor.execute('''
                INSERT OR REPLACE INTO shops (shop_id, shop_name, city, latitude, longitude, spreadsheet_url, photo_url, category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (shop['shop_id'], shop['shop_name'], shop['city'], 
                  shop['latitude'], shop['longitude'], shop['spreadsheet_url'], shop.get('photo_url'), shop['category']))
            synced_count += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True, 
            'synced': synced_count, 
            'deleted': deleted_count,
            'message': f'╨б╨╕╨╜╤Е╤А╨╛╨╜╨╕╨╖╨╕╤А╨╛╨▓╨░╨╜╨╛: {synced_count}, ╤Г╨┤╨░╨╗╨╡╨╜╨╛: {deleted_count}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def index():
    """╨У╨╗╨░╨▓╨╜╨░╤П ╤Б╤В╤А╨░╨╜╨╕╤Ж╨░ API"""
    return jsonify({
        'name': 'Multi Shop API',
        'version': '1.0.0',
        'endpoints': [
            '/api/cities',
            '/api/shops/<city>',
            '/api/shop/<shop_id>',
            '/api/shop/<shop_id>/catalog',
            '/api/admin/shops',
            '/api/admin/sync',
            '/api/roads'
        ]
    })


@app.route('/api/roads', methods=['GET', 'POST', 'OPTIONS'])
def get_roads():
    """
    ╨Я╤А╨╛╨║╤Б╨╕ ╨┤╨╗╤П Overpass API ╤Б ╨║╤Н╤И╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡╨╝
    ╨Ч╨░╨│╤А╤Г╨╢╨░╨╡╤В ╨┤╨╛╤А╨╛╨│╨╕ ╨┤╨╗╤П ╨║╨░╤А╤В╤Л ╤Б ╨╜╨╡╨╛╨╜╨╛╨╝
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    # GET ╨╖╨░╨┐╤А╨╛╤Б - ╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╨╡╨╝ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╤О
    if request.method == 'GET':
        return jsonify({
            'status': 'ok',
            'endpoint': '/api/roads',
            'method': 'POST',
            'description': '╨Я╤А╨╛╨║╤Б╨╕ ╨┤╨╗╤П Overpass API ╤Б ╨║╤Н╤И╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡╨╝',
            'cache_size': len(roads_cache),
            'cache_ttl': f'{CACHE_TTL} seconds',
            'example': {
                'url': 'https://chronosphere.pythonanywhere.com/api/roads',
                'method': 'POST',
                'headers': {'Content-Type': 'application/json'},
                'body': {
                    'bbox': '57.1,65.5,57.2,65.6',
                    'query': '[out:json][timeout:25];(way["highway"](bbox));out geom;'
                }
            }
        })
    
    try:
        data = request.get_json()
        bbox = data.get('bbox')
        query = data.get('query')
        
        if not bbox or not query:
            return jsonify({'error': 'bbox and query required'}), 400
        
        # ╨б╨╛╨╖╨┤╨░╨╡╨╝ ╨║╨╗╤О╤З ╨║╤Н╤И╨░ ╨╕╨╖ bbox (╨╛╨║╤А╤Г╨│╨╗╤П╨╡╨╝ ╨║╨╛╨╛╤А╨┤╨╕╨╜╨░╤В╤Л ╨┤╨╗╤П ╤Г╨▓╨╡╨╗╨╕╤З╨╡╨╜╨╕╤П ╨┐╨╛╨┐╨░╨┤╨░╨╜╨╕╨╣)
        bbox_rounded = [round(float(x), 3) for x in bbox.split(',')]
        cache_key = hashlib.md5(f"{bbox_rounded}".encode()).hexdigest()
        
        # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝ ╨║╤Н╤И
        now = datetime.now()
        cached_data_exists = cache_key in roads_cache
        
        if cached_data_exists:
            cached_data, cached_time = roads_cache[cache_key]
            if now - cached_time < timedelta(seconds=CACHE_TTL):
                return jsonify(cached_data)
        
        # ╨Ч╨░╨┐╤А╨░╤И╨╕╨▓╨░╨╡╨╝ ╤Г Overpass API ╤Б ╨┐╨╛╨▓╤В╨╛╤А╨╜╤Л╨╝╨╕ ╨┐╨╛╨┐╤Л╤В╨║╨░╨╝╨╕ ╨╕ ╤А╨░╨╖╨╜╤Л╨╝╨╕ ╤Б╨╡╤А╨▓╨╡╤А╨░╨╝╨╕
        max_retries = len(OVERPASS_SERVERS)
        for attempt in range(max_retries):
            server_url = OVERPASS_SERVERS[attempt % len(OVERPASS_SERVERS)]
            try:
                response = requests.post(
                    server_url,
                    data=query,
                    timeout=90  # ╨г╨▓╨╡╨╗╨╕╤З╨╡╨╜ ╨┤╨╛ 90 ╤Б╨╡╨║ ╨┤╨╗╤П ╨▒╨╛╨╗╤М╤И╨╕╤Е ╨╛╨▒╨╗╨░╤Б╤В╨╡╨╣
                )
                
                if response.status_code == 200:
                    try:
                        result = response.json()
                        
                        # ╨б╨╛╤Е╤А╨░╨╜╤П╨╡╨╝ ╨▓ ╨║╤Н╤И
                        roads_cache[cache_key] = (result, now)
                        
                        # ╨Ю╤З╨╕╤Й╨░╨╡╨╝ ╤Б╤В╨░╤А╤Л╨╡ ╨╖╨░╨┐╨╕╤Б╨╕ ╨╕╨╖ ╨║╤Н╤И╨░ (╤Г╨╝╨╡╨╜╤М╤И╨╡╨╜╨╛ ╨┤╨╛ 50 ╨┤╨╗╤П ╤Н╨║╨╛╨╜╨╛╨╝╨╕╨╕ RAM)
                        if len(roads_cache) > MAX_ROADS_CACHE_SIZE:
                            oldest_keys = sorted(
                                roads_cache.keys(),
                                key=lambda k: roads_cache[k][1]
                            )[:25]  # ╨г╨┤╨░╨╗╤П╨╡╨╝ ╨┐╨╛╨╗╨╛╨▓╨╕╨╜╤Г
                            for old_key in oldest_keys:
                                del roads_cache[old_key]
                        
                        return jsonify(result)
                    except json.JSONDecodeError:
                        if attempt < max_retries - 1:
                            continue
                        return jsonify({'error': 'Invalid JSON from Overpass'}), 502
                
                elif response.status_code == 429:
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(1)  # ╨Ъ╨╛╤А╨╛╤В╨║╨░╤П ╨┐╨░╤Г╨╖╨░ ╨┐╨╡╤А╨╡╨┤ ╨┐╨╛╨┐╤Л╤В╨║╨╛╨╣ ╨┤╤А╤Г╨│╨╛╨│╨╛ ╤Б╨╡╤А╨▓╨╡╤А╨░
                        continue
                    # ╨Т╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Г╤Б╤В╨░╤А╨╡╨▓╤И╨╕╨╣ ╨║╤Н╤И ╨╡╤Б╨╗╨╕ ╨╡╤Б╤В╤М
                    if cached_data_exists:
                        return jsonify(cached_data)
                    return jsonify({'error': 'Rate limit'}), 429
                
                elif response.status_code == 504:
                    if attempt < max_retries - 1:
                        continue
                    # ╨Т╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Г╤Б╤В╨░╤А╨╡╨▓╤И╨╕╨╣ ╨║╤Н╤И ╨╡╤Б╨╗╨╕ ╨╡╤Б╤В╤М
                    if cached_data_exists:
                        return jsonify(cached_data)
                    return jsonify({'error': 'Gateway timeout'}), 504
                
                else:
                    return jsonify({'error': f'Overpass error: {response.status_code}'}), 502
                    
            except requests.exceptions.Timeout:
                if attempt < max_retries - 1:
                    continue
                # ╨Т╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Г╤Б╤В╨░╤А╨╡╨▓╤И╨╕╨╣ ╨║╤Н╤И ╨╡╤Б╨╗╨╕ ╨╡╤Б╤В╤М
                if cached_data_exists:
                    return jsonify(cached_data)
                return jsonify({'error': 'Request timeout'}), 504
            
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    continue
                # ╨Т╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Г╤Б╤В╨░╤А╨╡╨▓╤И╨╕╨╣ ╨║╤Н╤И ╨╡╤Б╨╗╨╕ ╨╡╤Б╤В╤М
                if cached_data_exists:
                    return jsonify(cached_data)
                return jsonify({'error': str(e)}), 502
        
        # ╨Т╤Б╨╡ ╨┐╨╛╨┐╤Л╤В╨║╨╕ ╨╕╤Б╤З╨╡╤А╨┐╨░╨╜╤Л - ╨▓╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Г╤Б╤В╨░╤А╨╡╨▓╤И╨╕╨╣ ╨║╤Н╤И ╨╡╤Б╨╗╨╕ ╨╡╤Б╤В╤М
        if cached_data_exists:
            return jsonify(cached_data)
        return jsonify({'error': 'Max retries exceeded'}), 502
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/roads/cache/stats', methods=['GET'])
def cache_stats():
    """╨б╤В╨░╤В╨╕╤Б╤В╨╕╨║╨░ ╨║╤Н╤И╨░ ╨┤╨╛╤А╨╛╨│"""
    return jsonify({
        'cache_size': len(roads_cache),
        'cache_ttl': CACHE_TTL,
        'cached_areas': list(roads_cache.keys())
    })


@app.route('/api/roads/cache/clear', methods=['POST'])
def clear_roads_cache():
    """╨Ю╤З╨╕╤Б╤В╨║╨░ ╨║╤Н╤И╨░ ╨┤╨╛╤А╨╛╨│"""
    global roads_cache
    roads_cache = {}
    return jsonify({'success': True, 'message': 'Cache cleared'})


@app.route('/api/roads/warmup', methods=['POST'])
def warmup_cache():
    """╨Я╤А╨╛╨│╤А╨╡╨▓ ╨║╤Н╤И╨░ ╨┤╨╗╤П ╨┐╨╛╨┐╤Г╨╗╤П╤А╨╜╤Л╤Е ╨│╨╛╤А╨╛╨┤╨╛╨▓"""
    try:
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╤Б╨┐╨╕╤Б╨╛╨║ ╨│╨╛╤А╨╛╨┤╨╛╨▓ ╨╕╨╖ ╨С╨Ф
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # ╨Я╨╛╨╗╤Г╤З╨░╨╡╨╝ ╤Б╨┐╨╕╤Б╨╛╨║ ╨│╨╛╤А╨╛╨┤╨╛╨▓ ╤Б ╨╝╨░╨│╨░╨╖╨╕╨╜╨░╨╝╨╕
        cursor.execute('''
            SELECT city, 
                   MIN(latitude) as min_lat, MAX(latitude) as max_lat,
                   MIN(longitude) as min_lng, MAX(longitude) as max_lng,
                   COUNT(*) as shop_count
            FROM shops 
            GROUP BY city
            ORDER BY shop_count DESC
            LIMIT 5
        ''')
        
        cities = cursor.fetchall()
        conn.close()
        
        warmed_cities = []
        
        # ╨Ч╨░╨┐╤А╨░╤И╨╕╨▓╨░╨╡╨╝ ╨┤╨╛╤А╨╛╨│╨╕ ╨┤╨╗╤П ╨║╨░╨╢╨┤╨╛╨│╨╛ ╨│╨╛╤А╨╛╨┤╨░ ╨▓ ╤Д╨╛╨╜╨╡
        for city_name, min_lat, max_lat, min_lng, max_lng, count in cities:
            # ╨б╨╛╨╖╨┤╨░╨╡╨╝ bbox ╨▓╨╛╨║╤А╤Г╨│ ╨▓╤Б╨╡╤Е ╨╝╨░╨│╨░╨╖╨╕╨╜╨╛╨▓ ╨│╨╛╤А╨╛╨┤╨░ + 30╨║╨╝ ╨▒╤Г╤Д╨╡╤А
            buffer = 0.27  # ~30╨║╨╝
            bbox = f"{min_lat-buffer},{min_lng-buffer},{max_lat+buffer},{max_lng+buffer}"
            
            # ╨Т╤Л╤З╨╕╤Б╨╗╤П╨╡╨╝ ╤А╨░╨╖╨╝╨╡╤А ╨╛╨▒╨╗╨░╤Б╤В╨╕
            area_km = f"{(max_lat-min_lat+buffer*2)*111:.1f}├Ч{(max_lng-min_lng+buffer*2)*111:.1f}╨║╨╝"
            
            query = f'''
                [out:json][timeout:60];
                (way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|road|service|living_street"]["highway"!~".*_link"]({bbox}));
                out geom;
            '''
            
            # ╨Ш╨╝╨╕╤В╨╕╤А╤Г╨╡╨╝ ╨╖╨░╨┐╤А╨╛╤Б ╤З╨╡╤А╨╡╨╖ ╨╛╤Б╨╜╨╛╨▓╨╜╨╛╨╣ endpoint
            bbox_rounded = [round(float(x), 3) for x in bbox.split(',')]
            cache_key = hashlib.md5(f"{bbox_rounded}".encode()).hexdigest()
            
            # ╨Я╤А╨╛╨▓╨╡╤А╤П╨╡╨╝, ╨╡╤Б╤В╤М ╨╗╨╕ ╤Г╨╢╨╡ ╨▓ ╨║╤Н╤И╨╡
            if cache_key in roads_cache:
                cached_data, cached_time = roads_cache[cache_key]
                if datetime.now() - cached_time < timedelta(seconds=CACHE_TTL):
                    warmed_cities.append(f"{city_name} (╨╕╨╖ ╨║╤Н╤И╨░)")
                    continue
            
            # ╨Ч╨░╨│╤А╤Г╨╢╨░╨╡╨╝ ╨┤╨░╨╜╨╜╤Л╨╡
            try:
                response = requests.post(
                    OVERPASS_SERVERS[0],
                    data=query,
                    timeout=90  # ╨г╨▓╨╡╨╗╨╕╤З╨╡╨╜ timeout ╨┤╨╗╤П ╨▒╨╛╨╗╤М╤И╨╕╤Е ╨╛╨▒╨╗╨░╤Б╤В╨╡╨╣
                )
                
                if response.status_code == 200:
                    result = response.json()
                    roads_cache[cache_key] = (result, datetime.now())
                    warmed_cities.append(f"{city_name} ({len(result.get('elements', []))} ╨┤╨╛╤А╨╛╨│, {area_km})")
                else:
                    warmed_cities.append(f"{city_name} (╨╛╤И╨╕╨▒╨║╨░ {response.status_code})")
            except Exception as e:
                warmed_cities.append(f"{city_name} (╨╛╤И╨╕╨▒╨║╨░: {str(e)[:50]})")
        
        return jsonify({
            'success': True,
            'warmed_cities': warmed_cities,
            'cache_size': len(roads_cache)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Activity tracking endpoints
activity_storage = {}  # Simple in-memory storage: {user_id: [activities]}

@app.route('/api/activity/track', methods=['POST', 'OPTIONS'])
@rate_limit(max_requests=100, window_seconds=60)
def track_activity():
    """Track user activity"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        # Store activity with timestamp
        activity_entry = {
            'timestamp': datetime.now().isoformat(),
            'city': data.get('city'),
            'category': data.get('category'),
            'shop_id': data.get('shop_id')
        }
        
        if user_id not in activity_storage:
            activity_storage[user_id] = []
        
        activity_storage[user_id].append(activity_entry)
        
        # Keep only last 100 activities per user
        if len(activity_storage[user_id]) > 100:
            activity_storage[user_id] = activity_storage[user_id][-100:]
        
        return jsonify({'success': True}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/activity/stats', methods=['GET', 'OPTIONS'])
@rate_limit(max_requests=50, window_seconds=60)
def get_activity_stats():
    """Get activity statistics"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        # Calculate statistics from activity_storage
        cities = {}  # {city_name: set(user_ids)}
        categories = {}  # {category: set(user_ids)}
        shops = {}  # {shop_id: set(user_ids)}
        unique_users = set()
        
        # Get activities from last 24 hours
        cutoff_time = datetime.now() - timedelta(hours=24)
        
        for user_id, activities in activity_storage.items():
            for activity in activities:
                try:
                    activity_time = datetime.fromisoformat(activity['timestamp'])
                    if activity_time > cutoff_time:
                        unique_users.add(user_id)
                        
                        if activity.get('city'):
                            if activity['city'] not in cities:
                                cities[activity['city']] = set()
                            cities[activity['city']].add(user_id)
                        
                        if activity.get('category'):
                            if activity['category'] not in categories:
                                categories[activity['category']] = set()
                            categories[activity['category']].add(user_id)
                        
                        if activity.get('shop_id'):
                            if activity['shop_id'] not in shops:
                                shops[activity['shop_id']] = set()
                            shops[activity['shop_id']].add(user_id)
                except:
                    continue
        
        # Convert sets to counts
        return jsonify({
            'cities': {city: len(users) for city, users in cities.items()},
            'categories': {category: len(users) for category, users in categories.items()},
            'shops': {shop_id: len(users) for shop_id, users in shops.items()},
            'total': len(unique_users)
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug/cache-stats', methods=['GET'])
def get_cache_stats():
    """Debug endpoint для проверки статистики кэша"""
    try:
        now = time.time()
        sheets_cache_info = []
        
        for cache_key, (data, cached_time) in _sheets_cache.items():
            age_seconds = now - cached_time
            ttl_remaining = SHEETS_CACHE_TTL - age_seconds
            sheets_cache_info.append({
                'key': cache_key,
                'age_seconds': round(age_seconds, 2),
                'ttl_remaining_seconds': round(ttl_remaining, 2),
                'is_valid': ttl_remaining > 0,
                'data_size': len(data) if data else 0
            })
        
        return jsonify({
            'sheets_cache': {
                'total_entries': len(_sheets_cache),
                'ttl_seconds': SHEETS_CACHE_TTL,
                'entries': sheets_cache_info
            },
            'roads_cache': {
                'total_entries': len(roads_cache),
                'ttl_seconds': CACHE_TTL
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug/test-sheets')
def test_sheets_connection():
    """Тестовый endpoint для проверки подключения к Google Sheets"""
    import os
    result = {
        'credentials_file_exists': os.path.exists(GOOGLE_SHEETS_CREDS),
        'credentials_path': GOOGLE_SHEETS_CREDS,
        'spreadsheet_id': MAIN_SPREADSHEET_ID,
        'errors': []
    }
    
    # Проверка 1: Файл credentials существует
    if not result['credentials_file_exists']:
        result['errors'].append(f"Credentials file not found at: {GOOGLE_SHEETS_CREDS}")
        return jsonify(result), 500
    
    # Проверка 2: Попытка создать клиента
    try:
        client = get_gspread_client()
        result['client_created'] = True
    except Exception as e:
        result['client_created'] = False
        result['errors'].append(f"Failed to create gspread client: {str(e)}")
        return jsonify(result), 500
    
    # Проверка 3: Попытка открыть таблицу
    try:
        spreadsheet = client.open_by_key(MAIN_SPREADSHEET_ID)
        result['spreadsheet_opened'] = True
        result['spreadsheet_title'] = spreadsheet.title
    except Exception as e:
        result['spreadsheet_opened'] = False
        result['errors'].append(f"Failed to open spreadsheet: {str(e)}")
        return jsonify(result), 500
    
    # Проверка 4: Попытка прочитать первый лист
    try:
        sheet = spreadsheet.sheet1
        result['first_sheet_name'] = sheet.title
        result['first_sheet_id'] = sheet.id
    except Exception as e:
        result['errors'].append(f"Failed to get first sheet: {str(e)}")
        return jsonify(result), 500
    
    # Проверка 5: Попытка прочитать данные
    try:
        data = sheet.get('A1:I10')
        result['data_read'] = True
        result['sample_rows'] = len(data)
        result['first_row'] = data[0] if data else []
    except Exception as e:
        result['data_read'] = False
        result['errors'].append(f"Failed to read data: {str(e)}")
        return jsonify(result), 500
    
    result['success'] = True
    return jsonify(result), 200


@app.route('/api/debug/test-read-sheets')
def test_read_sheets():
    """Тестовое чтение данных из Google Sheets"""
    try:
        # Читаем данные напрямую
        rows = get_google_sheets_data(MAIN_SPREADSHEET_ID, 'A1:I501')
        
        # Форматируем первые 10 строк для удобного просмотра
        formatted_rows = []
        for i, row in enumerate(rows[:10]):
            formatted_row = {}
            for j, cell in enumerate(row):
                column_letter = chr(65 + j)  # A=65, B=66, etc
                formatted_row[f"{column_letter} (index {j})"] = cell
            formatted_rows.append({
                'row_number': i,
                'data': formatted_row,
                'row_length': len(row)
            })
        
        result = {
            'total_rows': len(rows),
            'first_10_rows': formatted_rows,
            'expected_structure': {
                'A (0)': 'Город',
                'B (1)': 'Категория',
                'C (2)': 'Название',
                'D (3)': 'Ссылка на таблицу',
                'E (4)': 'ID',
                'F (5)': '2ГИС',
                'G (6)': 'Описание',
                'H (7)': 'Фото'
            }
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/debug/check-db')
def check_database():
    """Проверка содержимого базы данных SQLite"""
    import os
    result = {
        'db_path': DB_PATH,
        'db_exists': os.path.exists(DB_PATH)
    }
    
    if not result['db_exists']:
        result['error'] = 'Database file does not exist'
        return jsonify(result), 404
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Проверяем таблицу shops
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='shops'")
        table_exists = cursor.fetchone() is not None
        result['table_shops_exists'] = table_exists
        
        if not table_exists:
            result['error'] = 'Table "shops" does not exist'
            conn.close()
            return jsonify(result), 404
        
        # Получаем структуру таблицы
        cursor.execute("PRAGMA table_info(shops)")
        columns = cursor.fetchall()
        result['columns'] = [{'name': col[1], 'type': col[2]} for col in columns]
        
        # Получаем количество записей
        cursor.execute("SELECT COUNT(*) FROM shops")
        result['total_shops'] = cursor.fetchone()[0]
        
        # Получаем дату последнего обновления
        cursor.execute("SELECT MAX(updated_at) FROM shops")
        last_update = cursor.fetchone()[0]
        result['last_update'] = last_update
        
        if last_update:
            try:
                from datetime import datetime
                last_update_dt = datetime.fromisoformat(last_update)
                now = datetime.now()
                age_seconds = (now - last_update_dt).total_seconds()
                result['cache_age_seconds'] = round(age_seconds, 2)
                result['cache_valid'] = age_seconds < 300
            except:
                result['cache_age_seconds'] = None
                result['cache_valid'] = False
        
        # Получаем примеры данных (первые 3 записи)
        cursor.execute("""
            SELECT shop_id, shop_name, city, description, updated_at 
            FROM shops 
            LIMIT 3
        """)
        samples = cursor.fetchall()
        result['sample_data'] = [
            {
                'shop_id': row[0],
                'shop_name': row[1],
                'city': row[2],
                'description': row[3],
                'updated_at': row[4]
            }
            for row in samples
        ]
        
        conn.close()
        result['success'] = True
        return jsonify(result), 200
        
    except Exception as e:
        result['error'] = str(e)
        import traceback
        result['traceback'] = traceback.format_exc()
        return jsonify(result), 500


@app.route('/api/debug/clear-shops-db')
def clear_shops_db():
    """Очистка таблицы shops для пересоздания с правильными данными"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM shops")
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Database cleared. Call /api/all-shops to rebuild.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/proxy-image')
def proxy_image():
    """Прокси для изображений Google Drive (обход CORS на мобильных)"""
    import requests
    from flask import Response
    
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400
    
    try:
        # Делаем запрос к Google Drive с правильными заголовками
        response = requests.get(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://drive.google.com/'
        }, timeout=10, stream=True)
        
        if response.status_code != 200:
            return jsonify({'error': 'Failed to fetch image'}), response.status_code
        
        # Возвращаем изображение с правильными CORS заголовками
        return Response(
            response.content,
            mimetype=response.headers.get('Content-Type', 'image/jpeg'),
            headers={
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400'  # Кэш на 24 часа
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/clear-cache', methods=['POST'])
def clear_shops_cache():
    """Очистка кэша - принудительное обновление данных из Google Sheets"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Сбрасываем updated_at чтобы форсировать обновление при следующем запросе
        cursor.execute("UPDATE shops SET updated_at = '2000-01-01T00:00:00'")
        
        # Полностью очищаем кэш каталогов
        cursor.execute("DELETE FROM products")
        cursor.execute("DELETE FROM catalog_updates")
        
        conn.commit()
        conn.close()
        
        # Также очищаем кэш Google Sheets
        global _sheets_cache
        _sheets_cache.clear()
        
        return jsonify({
            'success': True,
            'message': 'Кэш полностью очищен. Каталоги будут перезагружены при следующих запросах'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug-uncached', methods=['GET'])
def debug_uncached():
    """Отладка: показывает магазины которые не закэшированы"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT s.shop_id, s.shop_name, s.spreadsheet_url,
                   cu.last_updated, cu.status
            FROM shops s
            LEFT JOIN catalog_updates cu ON s.shop_id = cu.shop_id
            WHERE cu.last_updated IS NULL 
               OR datetime(cu.last_updated) < datetime('now', '-6 hours')
            ORDER BY cu.last_updated ASC NULLS FIRST
            LIMIT 10
        """)
        
        uncached = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'uncached_count': len(uncached),
            'uncached_shops': [
                {
                    'shop_id': row[0],
                    'name': row[1],
                    'has_url': bool(row[2]),
                    'url': row[2][:50] if row[2] else None,
                    'last_updated': row[3],
                    'status': row[4]
                } for row in uncached
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cache-status', methods=['GET'])
def get_cache_status():
    """Проверка статуса кэширования каталогов"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Общее количество магазинов
        cursor.execute("SELECT COUNT(*) FROM shops")
        total_shops = cursor.fetchone()[0]
        
        # Количество магазинов с закэшированными каталогами
        cursor.execute("SELECT COUNT(*) FROM catalog_updates WHERE status = 'success'")
        cached_shops = cursor.fetchone()[0]
        
        # Общее количество товаров в кэше
        cursor.execute("SELECT COUNT(*) FROM products")
        total_products = cursor.fetchone()[0]
        
        # Последние обновления
        cursor.execute("""
            SELECT cu.shop_id, s.shop_name, cu.last_updated, cu.status,
                   (SELECT COUNT(*) FROM products p WHERE p.shop_id = cu.shop_id) as product_count
            FROM catalog_updates cu
            JOIN shops s ON cu.shop_id = s.shop_id
            ORDER BY cu.last_updated DESC
            LIMIT 10
        """)
        recent_updates = cursor.fetchall()
        
        conn.close()
        
        return jsonify({
            'total_shops': total_shops,
            'cached_shops': cached_shops,
            'total_products': total_products,
            'cache_percentage': round(cached_shops / total_shops * 100, 1) if total_shops > 0 else 0,
            'recent_updates': [
                {
                    'shop_id': row[0],
                    'shop_name': row[1],
                    'last_updated': row[2],
                    'status': row[3],
                    'product_count': row[4]
                } for row in recent_updates
            ]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/search-products', methods=['GET'])
def search_products():
    """Поиск товаров по кэшу каталогов"""
    # Попытка закэшировать один магазин в фоне (не блокирует ответ)
    try:
        try_cache_one_shop()
    except Exception as e:
        print(f"[SEARCH] Cache update failed: {e}")
        import traceback
        traceback.print_exc()
    
    query = request.args.get('q', '').strip().lower()
    sort_by = request.args.get('sort', 'relevance')  # relevance, price_asc, price_desc
    
    if not query or len(query) < 2:
        return jsonify({'error': 'Query too short. Minimum 2 characters'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Разбиваем запрос на слова для поиска
        query_words = query.split()
        
        # Базовый SQL запрос
        base_sql = """
            SELECT 
                p.product_name,
                p.category_path,
                p.price,
                p.price_numeric,
                p.photo_url,
                p.description,
                p.shop_id,
                s.shop_name,
                s.category,
                s.city
            FROM products p
            JOIN shops s ON p.shop_id = s.shop_id
            WHERE """
        
        # Для каждого слова добавляем условие поиска
        conditions = []
        params = []
        for word in query_words:
            conditions.append("(LOWER(p.product_name) LIKE ? OR LOWER(p.category_path) LIKE ?)")
            params.extend([f'%{word}%', f'%{word}%'])
        
        sql = base_sql + " AND ".join(conditions) + " LIMIT 200"
        
        cursor.execute(sql, params)
        
        rows = cursor.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            product_name, category_path, price, price_numeric, photo_url, description, shop_id, shop_name, category, city = row
            
            # Вычисляем релевантность
            product_name_lower = (product_name or '').lower()
            position = product_name_lower.find(query)
            
            if product_name_lower == query:
                relevance = 10000
            elif product_name_lower.startswith(query):
                relevance = 5000 - position
            else:
                relevance = 1000 - position
            
            results.append({
                'product_name': product_name,
                'category_path': category_path,
                'price': price,
                'price_numeric': price_numeric,
                'photo_url': photo_url,
                'description': description,
                'shop_id': shop_id,
                'shop_name': shop_name,
                'shop_category': category,
                'city': city,
                'relevance': relevance
            })
        
        # Сортировка
        if sort_by == 'price_asc':
            results.sort(key=lambda x: (x['price_numeric'] is None, x['price_numeric'] or float('inf')))
        elif sort_by == 'price_desc':
            results.sort(key=lambda x: (x['price_numeric'] is None, -(x['price_numeric'] or 0)))
        else:  # relevance
            results.sort(key=lambda x: -x['relevance'])
        
        # Удаляем технические поля
        for r in results:
            del r['relevance']
            del r['price_numeric']
        
        return jsonify({
            'query': query,
            'results': results[:100],
            'total': len(results)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/wholesale-shops', methods=['GET'])
def get_wholesale_shops():
    """Получение всех магазинов из листа ОПТ"""
    try:
        # Читаем данные из листа "ОПТ"
        spreadsheet = get_main_spreadsheet()
        worksheet = spreadsheet.worksheet('ОПТ')
        rows = worksheet.get_all_values()[1:]  # Пропускаем заголовок
        
        shops = []
        current_category = ""
        current_city = ""
        
        for row in rows:
            # Структура идентична основному листу:
            # A=Город, B=Категория, C=Название, D=Ссылка на таблицу, E=ID, F=2ГИС, G=Описание, H=Фото
            city_value = row[0].strip() if len(row) > 0 and row[0] else ""
            category_value = row[1].strip() if len(row) > 1 and row[1] else ""
            name = row[2].strip() if len(row) > 2 and row[2] else ""
            spreadsheet_url = row[3].strip() if len(row) > 3 and row[3] else ""
            shop_id = row[4].strip() if len(row) > 4 and row[4] else ""
            gis_url = row[5].strip() if len(row) > 5 and row[5] else ""
            description = row[6].strip() if len(row) > 6 and row[6] else ""
            photo_url = row[7].strip() if len(row) > 7 and row[7] else ""
            
            # Строка без ID - это заголовок категории/города
            if not shop_id:
                if city_value:
                    current_city = city_value.title()
                if category_value:
                    current_category = category_value
                continue
            
            if not name or not current_city:
                continue
            
            # Парсим координаты из ссылки 2ГИС
            import re
            latitude, longitude = 0.0, 0.0
            
            if gis_url:
                coords_match = re.search(r'm=([0-9.]+)(?:%2C|,)([0-9.]+)', gis_url)
                if coords_match:
                    longitude = float(coords_match.group(1))
                    latitude = float(coords_match.group(2))
            
            shops.append({
                'city': current_city,
                'category': current_category if current_category else 'Без категории',
                'name': name,
                'shop_id': shop_id,
                'spreadsheet_url': spreadsheet_url,
                'description': description,
                'photo_url': photo_url,
                'latitude': latitude,
                'longitude': longitude
            })
        
        return jsonify({
            'shops': shops,
            'total': len(shops)
        })
    
    except Exception as e:
        print(f"Error loading wholesale shops: {e}")
        return jsonify({'error': str(e), 'shops': []}), 500


@app.route('/api/access-list', methods=['GET'])
def get_access_list():
    """Получение списка доступа из листа ДОСТУП"""
    try:
        # Читаем данные из листа "ДОСТУП"
        spreadsheet = get_main_spreadsheet()
        worksheet = spreadsheet.worksheet('ДОСТУП')
        rows = worksheet.get_all_values()[1:]  # Пропускаем заголовок
        
        access_list = []
        
        for row in rows:
            # A=Город, B=ID телеграмм пользователя, C=Название магазина
            city = row[0].strip() if len(row) > 0 and row[0] else ""
            telegram_id = row[1].strip() if len(row) > 1 and row[1] else ""
            shop_name = row[2].strip() if len(row) > 2 and row[2] else ""
            
            # Пропускаем пустые строки
            if not city or not telegram_id:
                continue
            
            access_list.append({
                'city': city,
                'telegram_id': telegram_id,
                'shop_name': shop_name
            })
        
        return jsonify({
            'access_list': access_list,
            'total': len(access_list)
        })
    
    except Exception as e:
        print(f"Error loading access list: {e}")
        return jsonify({'error': str(e), 'access_list': []}), 500


if __name__ == '__main__':
    app.run(debug=True)
