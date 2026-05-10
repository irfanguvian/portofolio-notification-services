-- Postgres bootstrap for the Acumen monorepo.
-- Each microservice owns one schema in a single shared database.
CREATE SCHEMA IF NOT EXISTS gateway;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS notification;

GRANT ALL ON SCHEMA gateway TO acumen;
GRANT ALL ON SCHEMA portfolio TO acumen;
GRANT ALL ON SCHEMA notification TO acumen;
