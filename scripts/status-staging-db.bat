@echo off
echo ========================================
echo   MERAVIE - Stato Database Staging
echo ========================================
echo.
aws rds describe-db-instances --db-instance-identifier meravie-staging-db --query "DBInstances[0].[DBInstanceStatus,Endpoint.Address,Endpoint.Port]" --output table
echo.
pause
