terraform {
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.22"
    }
  }
}

provider "grafana" {
  url  = var.grafana_endpoint
  auth = var.grafana_auth_key
}

resource "grafana_contact_point" "discord_alert" {
  name = "Discord Alert"

  discord {
    url     = var.discord_webhook_url
    title   = "Grafana Alert"
    message = "Alert: {{ .CommonLabels.alertname }}\n\n{{ .Alerts.Firing | len }} firing alerts"
  }
}

resource "grafana_data_source" "home_influxdb" {
  name = "Home InfluxDB"
  type = "influxdb"

  url = var.influxdb_url

  http_headers = {
    "Authorization" = "Token ${var.influxdb_token}"
  }

  database_name = var.influxdb_bucket
  username      = var.influxdb_username

  secure_json_data_encoded = jsonencode({
    password = var.influxdb_password
  })
}

resource "grafana_data_source" "home_prometheus" {
  name = "Home Prometheus"
  type = "prometheus"

  url = var.prometheus_url
}

