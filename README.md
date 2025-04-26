# sor4chi.com

## Setup

1. Configure secrets in ./secrets/\*

```bash
# configure yourself
touch ./secrets/.env.influxdb2-admin-username
openssl rand -base64 32 > ./secrets/.env.influxdb2-admin-password
openssl rand -base64 32 > ./secrets/.env.influxdb2-admin-token
```

2. Deploy docker containers

```bash
docker-compose up -d
```

3. Deploy grafana

Access the Grafana UI, create new service accounts and generate API keys for applying the Grafana dashboard.

```bash
touch ./secrets/grafana.tfvars
```

`grafana.tfvars` example:

```hcl
grafana_auth_key = "your_grafana_auth_key"
discord_webhook_url = "your_grafana_auth_key"
```

```bash
cd grafana
terraform init
terraform apply -var-file=../secrets/grafana.tfvars
```
