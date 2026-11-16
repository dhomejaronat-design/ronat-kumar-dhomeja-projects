# Inventory Management System

A full stack app for tracking products, categories and suppliers. The dashboard shows live totals, and every list supports adding, editing, deleting and searching.

**Stack:** Angular 20 and TypeScript (frontend), Node.js and Express 5 (REST API), MySQL, Docker, AWS RDS, Amazon ECS, CloudWatch

## Features

- **Dashboard** with total products, total units in stock, suppliers and categories
- **Products** with SKU, category, supplier, price and quantity, plus search by name and a "recently added" list
- **Categories** and **suppliers** with full create, read, update and delete
- **Relational schema** with foreign keys (deleting a supplier keeps its products, deleting a category in use is blocked), unique SKUs and indexes on common lookups
- Prices stored in **whole cents** to avoid rounding errors
- **Docker Compose** runs MySQL, the API and the site with one command
- **Set up for AWS:** RDS over SSL with a connection pool, a `/health` endpoint, JSON logs for CloudWatch, error alarms and graceful shutdown

## Project layout

```
docker-compose.yml  runs everything locally
deploy/             AWS: ECS task definition and CloudWatch setup
backend/            Node.js and Express API (port 3000)
  main.js           server entry point and graceful shutdown
  app.js            routes, health check, request logging
  logger.js         JSON logs for CloudWatch
  db.js             MySQL connection (settings from environment variables)
  db.sql            schema and sample data
  routes/           products, categories, suppliers, dashboard
  test/             API tests (run without a database)
frontend/           Angular app (port 4200)
  src/app/pages     dashboard, products, categories, suppliers
  src/app/services  API calls
```

## Run it with Docker (easiest)

```bash
docker compose up --build
```

Open http://localhost:4200. MySQL starts with the sample data already loaded.

## Run it without Docker

You need Node.js 20 or newer and MySQL.

**1. Database**

```bash
mysql -u root -p < backend/db.sql
```

This creates the `ims` database with sample data.

**2. Backend**

```bash
cd backend
cp .env.example .env     # then add your MySQL password
npm install
node --env-file=.env main.js
```

**3. Frontend**

```bash
cd frontend
npm install
npm start
```

Open http://localhost:4200.

## API

| Method | Path | What it does |
|---|---|---|
| `GET` | `/dashboard/stats` | Totals for the dashboard |
| `GET` | `/products` | All products |
| `GET` | `/products/recent` | The 10 newest products |
| `GET` | `/products/search/:name` | Products whose name contains the text |
| `GET` | `/products/:id` | One product |
| `POST` / `PUT` / `DELETE` | `/products`, `/products/:id` | Add, update, delete |
| `GET` / `POST` / `PUT` / `DELETE` | `/categories`, `/categories/:id` | Categories |
| `GET` / `POST` / `PUT` / `DELETE` | `/suppliers`, `/suppliers/:id` | Suppliers |
| `GET` | `/suppliers/:id/products` | Products from one supplier |

All queries use parameters (`?`), never string building, so user input can't change the SQL.

## Deploy to AWS

The backend runs as a container on **Amazon ECS (Fargate)**, talks to **Amazon RDS for MySQL** over SSL, and sends its logs to **CloudWatch**.

1. **Database.** Create an RDS MySQL 8 instance, then load the schema: `mysql -h <rds-endpoint> -u admin -p < backend/db.sql`
2. **Password.** Store the database password in AWS Secrets Manager as `inventory/db-password`.
3. **Image.** Build and push the backend to Amazon ECR:
   ```bash
   docker build -t inventory-backend ./backend
   docker tag inventory-backend <account>.dkr.ecr.<region>.amazonaws.com/inventory-backend:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/inventory-backend:latest
   ```
4. **Service.** Fill in the placeholders in `deploy/ecs-task-definition.json` and register it with ECS. Set `DB_SSL=true` so the connection to RDS is encrypted.
5. **Monitoring.** Run `REGION=<region> ./deploy/cloudwatch-setup.sh`. It creates metrics for errors and slow requests (over 1 second) and an alarm when there are 5 or more errors in 5 minutes.

**How the backend is built for this**

| Need | How |
|---|---|
| RDS drops idle connections | A connection pool with keep-alive reconnects on its own |
| Encrypted connection to RDS | `DB_SSL=true` uses the Amazon RDS certificates bundled with `mysql2` |
| ECS knows if a task is healthy | `/health` checks the database and answers 503 if it's unreachable |
| Searchable logs | Every line is JSON (`time`, `level`, `msg`, `method`, `path`, `status`, `ms`), so CloudWatch Logs Insights can filter on any field |
| Database errors don't leak | The real error is logged, and the user only sees "Database error" |
| Deploys don't cut off requests | On `SIGTERM` the server finishes open requests and closes the pool before exiting |

**Useful CloudWatch Logs Insights queries**

```
# Errors in the last hour
fields time, msg, code, message | filter level = "error" | sort time desc

# Slowest endpoints
filter msg = "request" | stats avg(ms), max(ms), count() by path | sort avg(ms) desc
```

## Tests

```bash
cd backend && npm test        # 15 API tests with a fake database
cd frontend && npx ng test    # 7 Angular tests
```
