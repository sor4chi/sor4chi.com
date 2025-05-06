variable "public_key_path" {
  description = "Path to the public key for AWS EC2 instance"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "private_key_path" {
  description = "Path to the private key for AWS EC2 instance"
  type        = string
  default     = "~/.ssh/id_rsa"
}

variable "my_ip" {
  description = "You public IP address for temporary access to the instance"
  type        = string
}

variable "profile" {
  description = "AWS profile to use"
  type        = string
  default     = "default"
}
