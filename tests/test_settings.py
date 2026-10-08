import sqlite3


def test_settings_persist_and_merge(app_module, tmp_path, monkeypatch):
    db = tmp_path / 'settings.db'
    monkeypatch.setattr(app_module, 'DB_PATH', str(db))
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE user_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
    with app_module.app.test_client() as client:
        assert client.get('/api/settings').json == {}
        assert client.post('/api/settings', json={'zeta-project': '{"wingspan":2.2}'}).status_code == 200
        assert client.post('/api/settings', json={'zeta-manufacturing': '{"motorDiameter":42}'}).status_code == 200
        assert client.post('/api/settings', json={'zeta-project': '{"wingspan":2.4}'}).status_code == 200
        assert client.post('/api/settings', json={'bad-key': 'oops', 'zeta-project': 'lost'}).status_code == 400
    with app_module.app.test_client() as fresh:
        assert fresh.get('/api/settings').json == {'zeta-project': '{"wingspan":2.4}', 'zeta-manufacturing': '{"motorDiameter":42}'}


def test_named_designs_separate_and_invalid_files_rejected(app_module, tmp_path, monkeypatch):
    db = tmp_path / 'designs.db'
    monkeypatch.setattr(app_module, 'DB_PATH', str(db))
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE saved_designs(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    first={'format':'zeta-project','schemaVersion':1,'name':'Birinci','project':{'wingspan':'2.2'},'manufacturing':{'motorDiameter':42}}
    second={**first,'name':'İkinci','project':{'wingspan':'1.8'}}
    with app_module.app.test_client() as c:
        one=c.post('/api/designs',json=first)
        two=c.post('/api/designs',json=second)
        assert one.status_code == two.status_code == 201
        assert one.json['id'] != two.json['id']
        assert c.get('/api/designs/'+str(one.json['id'])).json == first
        assert c.get('/api/designs/'+str(two.json['id'])).json == second
        assert c.post('/api/designs',json={'name':'bad'}).status_code == 400
        assert c.post('/api/designs',json={**first,'schemaVersion':99}).status_code == 400
        assert len(c.get('/api/designs').json) == 2
        assert c.get('/api/designs/999999').status_code == 404
