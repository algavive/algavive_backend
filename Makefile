# 9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248

DB_LOCATION=.wrangler/state/v3/d1/miniflare-D1DatabaseObject

DB_FILE=9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite

SCHEMA_FILE=src/schema.sql

DEV_DB = sqlite://file?mode=memory

.PHONY: all apply diff status fmt help
applyaa:
	atlas schema apply \
	--url "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	--to "file://$(SCHEMA_FILE)" \
	--dev-url "$(DEV_DB)"  \
	--auto-approve

apply:
	atlas schema apply \
	  --url "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	  --to "file://$(SCHEMA_FILE)" \
	  --dev-url "$(DEV_DB)" 

diff:
	atlas schema diff \
	  --from "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	  --to "file://$(SCHEMA_FILE)" \
	  --dev-url "$(DEV_DB)"

status:
	atlas schema inspect \
	  --url "sqlite://$(DB_LOCATION)/$(DB_FILE)" \
	  --dev-url "$(DEV_DB)"

fmt:
	atlas schema fmt --file "$(SCHEMA_FILE)"

clean:
	rm -rf .atlas

all: applyaa