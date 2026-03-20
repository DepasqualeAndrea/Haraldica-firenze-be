# 🛍️ Meravie E-commerce - Backend API

Backend NestJS completo per e-commerce Meravie con Stripe, BRT shipping, multi-provider email e security enterprise-grade.

## ✅ PRODUCTION-READY - Security Fixes Completate

Tutte le vulnerabilità critiche risolte e progetto pronto per deployment AWS.

---

## 🚀 Quick Start

```bash
# Install
npm install

# Development
npm run start:dev

# Build
npm run build

# Deploy
git push origin main  # Auto-deploy via GitHub Actions
```

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guida deployment AWS completa
- **[.env.example](.env.example)** - Template environment variables
- **API Docs**: http://localhost:3000/api (Swagger)

## 🔒 Security Features

✅ Database SSL secured
✅ Redis Token Blacklist (distributed)
✅ Stripe Webhook DB tracking
✅ File Upload magic bytes validation
✅ Email failover + retry logic
✅ Password reset flow completo
✅ CSP + Security headers
✅ Health checks comprehensive
✅ AWS Parameter Store ready

## 🏗️ Stack

- **NestJS** 11 + **TypeORM**
- **PostgreSQL** 16 (AWS RDS)
- **Redis** (caching + blacklist)
- **Stripe** payments
- **BRT** shipping
- **AWS S3** storage
- **Multi-provider** email (Resend/SES/SMTP)

## 📦 Deployment

**Staging/Production** su AWS ECS Fargate:
```bash
# Vedi DEPLOYMENT.md per setup completo
```

**Costi staging**: ~$46/mese (RDS + ECS + ALB)

## 🎯 API Endpoints

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /products
POST   /cart/add
POST   /checkout/payment
GET    /orders/:id
POST   /webhooks/stripe
GET    /health/ready
```

## 👥 Team

Meravie S.r.l. - E-commerce Platform

📧 amministrazione@meravien.com
