resource "grafana_dashboard" "home_server_metrics" {
  folder      = grafana_folder.home_server_folder.uid
  config_json = file("${path.module}/dashboards/home_server_metrics.json")
}


resource "grafana_dashboard" "home_server_dashboard" {
  folder      = grafana_folder.home_server_folder.id
  config_json = file("${path.module}/dashboards/mc_vanilla_metrics.json")
}
