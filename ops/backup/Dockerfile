# The backup service (D81): pg_dump from the same Postgres major version as
# the database, the aws CLI for off-site copies, and a daily loop.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh restore-test.sh run.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh /usr/local/bin/run.sh
ENTRYPOINT ["run.sh"]
