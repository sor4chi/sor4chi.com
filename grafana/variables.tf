variable "grafana_auth_key" {
  description = "The API key for Grafana authentication"
  type        = string
}

variable "grafana_endpoint" {
  description = "The endpoint for Grafana"
  type        = string
  default     = "https://monitor.sor4chi.com"
}

variable "discord_webhook_url" {
  description = "The Discord webhook URL for alerts"
  type        = string
}


variable "influxdb_url" {
  description = "The URL for InfluxDB"
  type        = string
  default     = "http://influxdb2:8086/"
}

variable "influxdb_token" {
  description = "The token for InfluxDB authentication"
  type        = string
}

variable "influxdb_username" {
  description = "The username for InfluxDB authentication"
  type        = string
}

variable "influxdb_password" {
  description = "The password for InfluxDB authentication"
  type        = string
}

variable "influxdb_bucket" {
  description = "The bucket for InfluxDB"
  type        = string
  default     = "home"
}

variable "prometheus_url" {
  description = "The URL for Prometheus"
  type        = string
  default     = "http://prometheus:9090/"
}
