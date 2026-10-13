from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
import csv
from datetime import datetime
import os
import MySQLdb.cursors

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# MySQL Configuration
app.config['MYSQL_HOST'] = 'localhost'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = 'Appleissweet12345'
app.config['MYSQL_DB'] = 'vastra_db'

mysql = MySQL(app)

# ==================== DATABASE SETUP ====================
def init_database():
    """Create tables if they don't exist"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                category VARCHAR(100),
                image_url VARCHAR(255),
                description TEXT
            )
        ''')
        
        mysql.connection.commit()
        cursor.close()
        print("✓ Database initialized successfully!")
        
    except Exception as e:
        print(f"✗ Database Error: {e}")

# ==================== REGISTRATION ====================
@app.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        if not username or not email or not password:
            return jsonify({'error': 'All fields are required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT id FROM users WHERE username = %s OR email = %s', (username, email))
        
        if cursor.fetchone():
            cursor.close()
            return jsonify({'error': 'Username or email already exists'}), 400

        hashed_password = generate_password_hash(password)
        cursor.execute(
            'INSERT INTO users (username, email, password) VALUES (%s, %s, %s)',
            (username, email, hashed_password)
        )
        mysql.connection.commit()
        cursor.close()
        
        save_to_spreadsheet(username, email)
        
        return jsonify({'success': True, 'message': 'Registration successful! Please login.'}), 201

    except Exception as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500

# ==================== LOGIN ====================
@app.route('/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()

        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT id, username, email, password FROM users WHERE username = %s', (username,))
        user = cursor.fetchone()
        cursor.close()

        if user and check_password_hash(user['password'], password):
            return jsonify({
                'success': True,
                'message': 'Login successful',
                'user_id': user['id'],
                'username': user['username'],
                'email': user['email']
            }), 200
        else:
            return jsonify({'error': 'Invalid username or password'}), 401

    except Exception as e:
        return jsonify({'error': f'Login failed: {str(e)}'}), 500

# ==================== SPREADSHEET SAVE ====================
def save_to_spreadsheet(username, email):
    """Save registration to CSV"""
    try:
        filename = 'register_details.csv'
        file_exists = os.path.exists(filename)
        
        with open(filename, 'a', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['Username', 'Email', 'Registration Date']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            if not file_exists:
                writer.writeheader()
            
            writer.writerow({
                'Username': username,
                'Email': email,
                'Registration Date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
    except Exception as e:
        print(f"CSV Save Error: {e}")

# ==================== SEARCH ====================
@app.route('/search', methods=['GET'])
def search():
    """Search products"""
    try:
        query = request.args.get('q', '').strip()
        
        if not query:
            return jsonify({'error': 'Search query required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        search_term = f'%{query}%'
        
        cursor.execute('''
            SELECT id, name, price, category, image_url 
            FROM products 
            WHERE name LIKE %s OR category LIKE %s OR description LIKE %s
            LIMIT 20
        ''', (search_term, search_term, search_term))
        
        results = cursor.fetchall()
        cursor.close()

        products = [
            {
                'id': r['id'],
                'name': r['name'],
                'price': float(r['price']),
                'category': r['category'] or 'Uncategorized',
                'image_url': r['image_url'] or 'images/default.jpg'
            } for r in results
        ]

        return jsonify(products), 200

    except Exception as e:
        return jsonify({'error': f'Search error: {str(e)}'}), 500

# ==================== ADVANCED SEARCH ====================
@app.route('/search/advanced', methods=['GET'])
def advanced_search():
    """Advanced search with filters"""
    try:
        query = request.args.get('q', '').strip()
        category = request.args.get('category', '').strip()
        min_price = request.args.get('min_price', 0, type=float)
        max_price = request.args.get('max_price', 999999, type=float)

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        sql = 'SELECT id, name, price, category, image_url FROM products WHERE 1=1'
        params = []

        if query:
            sql += ' AND (name LIKE %s OR description LIKE %s)'
            params.extend([f'%{query}%', f'%{query}%'])
        
        if category:
            sql += ' AND category = %s'
            params.append(category)
        
        sql += ' AND price BETWEEN %s AND %s LIMIT 50'
        params.extend([min_price, max_price])

        cursor.execute(sql, tuple(params))
        results = cursor.fetchall()
        cursor.close()

        products = [
            {
                'id': r['id'],
                'name': r['name'],
                'price': float(r['price']),
                'category': r['category'] or 'Uncategorized',
                'image_url': r['image_url'] or 'images/default.jpg'
            } for r in results
        ]

        return jsonify(products), 200

    except Exception as e:
        return jsonify({'error': f'Search error: {str(e)}'}), 500

# ==================== PRODUCTS ====================
@app.route('/products', methods=['GET'])
def get_products():
    """Get all products"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT id, name, price, category, image_url FROM products LIMIT 100')
        results = cursor.fetchall()
        cursor.close()

        products = [
            {
                'id': r['id'],
                'name': r['name'],
                'price': float(r['price']),
                'category': r['category'] or 'Uncategorized',
                'image_url': r['image_url'] or 'images/default.jpg'
            } for r in results
        ]

        return jsonify(products), 200

    except Exception as e:
        return jsonify({'error': f'Error fetching products: {str(e)}'}), 500

@app.route('/products', methods=['POST'])
def add_product():
    """Add a new product"""
    try:
        data = request.json
        
        if not data.get('name') or not data.get('price'):
            return jsonify({'error': 'Name and price are required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('''
            INSERT INTO products (name, price, category, image_url, description)
            VALUES (%s, %s, %s, %s, %s)
        ''', (
            data['name'],
            data['price'],
            data.get('category', 'Uncategorized'),
            data.get('image_url', 'images/default.jpg'),
            data.get('description', '')
        ))
        
        mysql.connection.commit()
        cursor.close()

        return jsonify({'success': True, 'message': 'Product added successfully'}), 201

    except Exception as e:
        return jsonify({'error': f'Error adding product: {str(e)}'}), 500

# ==================== EXPORT ====================
@app.route('/export-users', methods=['GET'])
def export_users():
    """Export all users to CSV"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT username, email, created_at FROM users')
        users = cursor.fetchall()
        cursor.close()

        with open('all_users_export.csv', 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['Username', 'Email', 'Registered At']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            
            for user in users:
                writer.writerow({
                    'Username': user['username'],
                    'Email': user['email'],
                    'Registered At': user['created_at']
                })

        return jsonify({'success': True, 'message': 'Users exported to CSV'}), 200

    except Exception as e:
        return jsonify({'error': f'Export error: {str(e)}'}), 500

# ==================== HEALTH CHECK ====================
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'Server is running!', 'version': '1.0'}), 200

# ==================== ERROR HANDLERS ====================
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# serve index at root
@app.route('/', methods=['GET'])
def serve_index():
    return send_from_directory('.', 'index.html')

# serve any file in the project root (CSS/JS/images/register pages)
@app.route('/<path:filename>', methods=['GET'])
def serve_file(filename):
    # keep API routes working because they are defined above
    return send_from_directory('.', filename)

if __name__ == '__main__':
    print("Starting VASTRA Backend Server...")
    with app.app_context():
        init_database()
    print("Server running at http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000)