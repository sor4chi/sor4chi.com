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
