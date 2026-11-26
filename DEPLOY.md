# Deploying VSGOI ERP on a VPS (Ubuntu 22.04 or 24.04)

Plan: Node runs the API on port 4000 (kept alive by pm2), Nginx serves the built website and forwards `/api` to Node, MySQL holds the data, Certbot gives HTTPS.

## 0. Before you start (on your laptop)
1. Run the project once locally so `server/prisma/migrations` exists (`npx prisma migrate dev --name init`). Upload that folder with the code. The server applies it with `migrate deploy`.
2. Point your domain (for example `erp.vsgoi.org`) at the VPS IP with an A record.

## 1. Install software
```bash
sudo apt update && sudo apt install -y nginx mysql-server git unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Database
```bash
sudo mysql
CREATE DATABASE vsgoi_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'erp'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT ALL PRIVILEGES ON vsgoi_erp.* TO 'erp'@'localhost';
EXIT;
```

## 3. Code and settings
```bash
sudo mkdir -p /srv/vsgoi-erp && sudo chown $USER /srv/vsgoi-erp
# upload the project here (scp, git or the zip), then:
cd /srv/vsgoi-erp/server
cp .env.example .env && nano .env
```
Set in `.env`:
- `DATABASE_URL="mysql://erp:a-long-random-password@localhost:3306/vsgoi_erp"`
- `JWT_SECRET` = a long random string (`openssl rand -hex 48`)
- `CLIENT_ORIGIN="https://erp.vsgoi.org"`
- `NODE_ENV="production"`
- `SMTP_PASS` = the 16-character Google App password for webvsgoi@gmail.com. (Turn on 2-Step Verification for that Google account, then Google Account → Security → App passwords.) Never share this password in chat or commit it to git.

```bash
npm install
npx prisma migrate deploy
npm run db:bootstrap          # prints the admin password once. Write it down.
pm2 start "npm start" --name vsgoi-erp-api
pm2 save && pm2 startup       # run the command it prints, so the API restarts after a reboot
cd ../client && npm install && npm run build   # creates client/dist
```

## 4. Nginx
`sudo nano /etc/nginx/sites-available/vsgoi-erp`
```nginx
server {
  server_name erp.vsgoi.org;
  root /srv/vsgoi-erp/client/dist;
  index index.html;
  client_max_body_size 10m;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;   # big Excel imports take a while
  }
  location / { try_files $uri /index.html; }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/vsgoi-erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d erp.vsgoi.org
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 5. First sign-in
Open https://erp.vsgoi.org, sign in as `admin@vsgoi.org` with the password from `db:bootstrap`, set a new one, then: add faculty → add subjects → assign faculty → import students → schedule lectures.

## 6. Updating later
```bash
cd /srv/vsgoi-erp && git pull        # or upload the new files
cd server && npm install && npx prisma migrate deploy && pm2 restart vsgoi-erp-api
cd ../client && npm install && npm run build
```

## 7. Backups (do this on day one)
```bash
sudo mkdir -p /var/backups/erp
sudo crontab -e
# every night at 2am, keep 14 days:
0 2 * * * mysqldump --single-transaction vsgoi_erp | gzip > /var/backups/erp/erp-$(date +\%F).sql.gz && find /var/backups/erp -mtime +14 -delete
```
Copy the backups off the VPS now and then. A free VPS can disappear without warning.

## Gmail limits
A normal Gmail account sends about 500 emails a day, which is plenty for password-reset codes. If the code never arrives, check `pm2 logs vsgoi-erp-api` for the SMTP error.
