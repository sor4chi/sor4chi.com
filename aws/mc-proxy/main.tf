provider "aws" {
  region  = "ap-northeast-1"
  profile = var.profile
}

resource "aws_vpc" "mc_proxy_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = "mc-proxy-vpc"
  }
}

resource "aws_subnet" "mc_proxy_subnet" {
  vpc_id                  = aws_vpc.mc_proxy_vpc.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "ap-northeast-1a"
  tags = {
    Name = "mc-proxy-subnet"
  }
}

resource "aws_internet_gateway" "mc_proxy_igw" {
  vpc_id = aws_vpc.mc_proxy_vpc.id
  tags = {
    Name = "mc-proxy-igw"
  }
}

resource "aws_route_table" "mc_proxy_route_table" {
  vpc_id = aws_vpc.mc_proxy_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.mc_proxy_igw.id
  }

  tags = {
    Name = "mc-proxy-route-table"
  }
}

resource "aws_route_table_association" "mc_proxy_rta" {
  subnet_id      = aws_subnet.mc_proxy_subnet.id
  route_table_id = aws_route_table.mc_proxy_route_table.id
}

resource "aws_key_pair" "mc_proxy_key" {
  key_name   = "mc-proxy-key"
  public_key = file(var.public_key_path)
}

resource "aws_security_group" "mc_proxy_sg" {
  name        = "mc-proxy-sg"
  description = "Allow inbound TCP for tunnel"
  vpc_id      = aws_vpc.mc_proxy_vpc.id

  ingress {
    from_port   = 25565
    to_port     = 25565
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${var.my_ip}/32"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "mc_proxy" {
  ami           = "ami-026c39f4021df9abe" # Ubuntu 24.04
  instance_type = "t2.nano"
  key_name      = aws_key_pair.mc_proxy_key.key_name
  subnet_id     = aws_subnet.mc_proxy_subnet.id
  security_groups = [
    aws_security_group.mc_proxy_sg.id,
  ]

  tags = {
    Name = "mc-proxy-tunnel"
  }

  provisioner "local-exec" {
    command = "echo '${self.public_ip}' > hosts"
  }

  provisioner "remote-exec" {
    inline = [
      "sudo apt install python-is-python3", # install python for ansible
    ]

    connection {
      type        = "ssh"
      user        = "ubuntu"
      private_key = file(var.private_key_path)
      host        = self.public_ip
    }
  }

  provisioner "local-exec" {
    command = "ansible-playbook -i hosts playbook.yml --private-key=${var.private_key_path} --user=ubuntu"
    environment = {
      ANSIBLE_HOST_KEY_CHECKING = "False"
    }
  }
}

output "mc_proxy_public_ip" {
  description = "Public IP address of the mc-proxy EC2 instance"
  value       = aws_instance.mc_proxy.public_ip
}
