BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "satellite" (
	"id"	INTEGER NOT NULL,
	"noard_id"	TEXT,
	"name"	text,
	"hex_color"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "sensor" (
	"id"	INTEGER NOT NULL,
	"sat_noard_id"	TEXT,
	"sat_name"	text,
	"name"	text,
	"resolution"	real,
	"width"	real,
	"right_side_angle"	real,
	"left_side_angle"	real,
	"observe_angle"	real,
	"hex_color"	TEXT,
	"init_angle"	real,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "sys_user" (
	"id"	INTEGER NOT NULL,
	"user_name"	,
	"password"	,
	"email"	,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "tle" (
	"id"	INTEGER NOT NULL,
	"sat_noard_id"	TEXT,
	"time"	INTEGER,
	"line1"	TEXT,
	"line2"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "tle_site" (
	"id"	INTEGER NOT NULL,
	"site"	,
	"url"	,
	"description"	,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO "satellite" VALUES (1,'33321U','HJ-1A','2729446');
INSERT INTO "satellite" VALUES (2,'33320U','HJ-1B','760718');
INSERT INTO "sensor" VALUES (1,'33321U','HJ-1A','CCD1',30.0,360.0,0.0,0.0,30.0,'#9983E9',-14.5);
INSERT INTO "sensor" VALUES (2,'33321U','HJ-1A','CCD2',30.0,360.0,0.0,0.0,30.0,'#FF8055',14.5);
INSERT INTO "sensor" VALUES (3,'33321U','HJ-1A','HSI',100.0,50.0,30.0,30.0,4.5,'#CC6633',0.0);
INSERT INTO "sensor" VALUES (4,'33320U','HJ-1B','CCD1',30.0,360.0,0.0,0.0,30.0,'#99E6FF',-14.5);
INSERT INTO "sensor" VALUES (5,'33320U','HJ-1B','CCD2',30.0,360.0,0.0,0.0,30.0,'#8fbc8f',14.5);
INSERT INTO "sensor" VALUES (6,'33320U','HJ-1B','IRS',300.0,720.0,0.0,0.0,60.0,'#b87333',0.0);
INSERT INTO "sys_user" VALUES (1,'admin','$2a$10$6l9rd9MGzWeYog0OggMP4OPi36rSkihsQ.8.6YMrFk8oWuGx1c5bq','test@test.com');
INSERT INTO "tle_site" VALUES (1,'celestrak_resources','http://celestrak.com/NORAD/elements/resource.txt','celestrak上的资源卫星');
COMMIT;
