# Minecraft Proxy server

This server is used to proxy access to `minecraft.sor4chi.com` to a home server using Cloudflare Access.

## Setup

1. Configure aws cli
2. Prepare ansible
3. `terraform apply` to create the proxy Instance and setup cloudflare tunnel
   - You may need to input `my_ip`. for restricted ssh access
4. ssh and `journalctl -t cloudflared` and log in to cloudflare (for security reasons, I don't want to use token authentication)
