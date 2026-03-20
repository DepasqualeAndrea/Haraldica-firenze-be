@echo off
echo ========================================
echo   MERAVIE - Spegnimento Database Staging
echo ========================================
echo.
echo Spegnimento database staging...
aws rds stop-db-instance --db-instance-identifier meravie-staging-db
echo.
echo ========================================
echo   DB Staging in spegnimento
echo ========================================
echo.
echo Il DB sara' completamente spento in 2-3 minuti.
echo Costo quando spento: solo storage (~$2-3/mese)
echo.
pause
