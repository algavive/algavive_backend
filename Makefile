# 9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248

DB_LOCATION=.wrangler/state/v3/d1/miniflare-D1DatabaseObject

DB_FILE=9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite

SCHEMA_FILE=src/schema.sql

DEV_DB = sqlite://file?mode=memory

INJECT_SCHEMA = src/generated/execute.sql

DIR_GENERATED_SCHEMA_PRODUCTION = src/generated/schema-production.sql

DIR_BUILDED_SCHEMA_PRODUCTION = src/generated/schema-production.sqlite

.PHONY: all diff status fmt help

diff:
	atlas schema diff \
	  --from "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	  --to "file://$(SCHEMA_FILE)" \
	  --dev-url "$(DEV_DB)" \
	  --format "{{ sql . }}" > $(INJECT_SCHEMA)

status:
	atlas schema inspect \
	  --url "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	  --dev-url "$(DEV_DB)"

fmt:
	atlas schema fmt --file "$(SCHEMA_FILE)"

clean:
	rm -rf .atlas

export-build:
	sqlite3 $(DIR_BUILDED_SCHEMA_PRODUCTION) < $(DIR_GENERATED_SCHEMA_PRODUCTION)

export-diff:
	atlas schema diff \
	  --from "sqlite://$(DIR_BUILDED_SCHEMA_PRODUCTION)" \
	  --to "file://$(SCHEMA_FILE)" \
	  --dev-url "$(DEV_DB)" \
	  --format "{{ sql . }}" > $(INJECT_SCHEMA)

all: diff