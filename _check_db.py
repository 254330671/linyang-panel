import sys, sqlite3
sys.stdout.reconfigure(encoding='utf-8')

db_path = r'C:\Users\15040\Documents\xwechat_files\wxid_u8hb73h6ruxe22_f628\db_storage\message\message_0.db'
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print('Tables:', tables)
    conn.close()
except Exception as e:
    print('Error:', e)
