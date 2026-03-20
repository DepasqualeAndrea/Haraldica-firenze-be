@echo off
echo ========================================
echo   MERAVIE - Avvio Database Staging
echo ========================================
echo.
echo Avvio database staging...
aws rds start-db-instance --db-instance-identifier meravie-staging-db
echo.
echo Attendo che il DB sia disponibile (5-10 minuti)...
aws rds wait db-instance-available --db-instance-identifier meravie-staging-db
echo.
echo ========================================
echo   DB Staging PRONTO!
echo ========================================
echo.
echo Endpoint: meravie-staging-db.ch26e82m6lh6.eu-central-1.rds.amazonaws.com
echo Database: meravie_staging
echo Username: meravie_admin
echo.
pause
