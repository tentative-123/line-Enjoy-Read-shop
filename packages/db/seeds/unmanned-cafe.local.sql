-- LOCAL DEVELOPMENT ONLY. Replace dev-line-account with an existing local line_accounts.id.
INSERT OR IGNORE INTO venues VALUES ('venue-demo','dev-line-account','Enjoy Read 新店示範店','xindian-demo','無人閱讀與專注空間','新北市新店區示範路 1 號','Asia/Taipei',1,datetime('now'),datetime('now'));
INSERT OR IGNORE INTO spaces VALUES
('space-quiet','venue-demo','安靜閱讀區','QUIET',NULL,'capacity_pool',20,30,60,480,0,0,60,30,2880,5,5,30,0,'TWD',1,1,datetime('now'),datetime('now')),
('space-focus','venue-demo','個人專注座位區','FOCUS',NULL,'assigned_unit',10,30,60,480,0,0,60,30,2880,5,5,30,0,'TWD',2,1,datetime('now'),datetime('now')),
('space-room','venue-demo','小型討論室','ROOM',NULL,'assigned_unit',2,60,60,480,0,0,60,30,2880,5,5,30,0,'TWD',3,1,datetime('now'),datetime('now'));
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<20)
INSERT OR IGNORE INTO space_units SELECT 'quiet-'||printf('%02d',x),'space-quiet','C'||printf('%02d',x),'容量 '||x,0,1,x,1,datetime('now'),datetime('now') FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10)
INSERT OR IGNORE INTO space_units SELECT 'focus-'||printf('%02d',x),'space-focus','A'||printf('%02d',x),'A'||printf('%02d',x),1,1,x,1,datetime('now'),datetime('now') FROM n;
INSERT OR IGNORE INTO space_units VALUES ('room-01','space-room','R01','討論室 R01',1,4,1,1,datetime('now'),datetime('now')),('room-02','space-room','R02','討論室 R02',1,4,2,1,datetime('now'),datetime('now'));
WITH RECURSIVE d(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM d WHERE x<6), s(id) AS (VALUES('space-quiet'),('space-focus'),('space-room'))
INSERT OR IGNORE INTO space_opening_hours SELECT s.id||'-'||d.x,s.id,d.x,'08:00','23:00',1 FROM s,d;
