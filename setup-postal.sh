#!/bin/bash

echo "🚀 Setting up Postal Email Server for Bowery Creative"
echo "=================================================="

# Create postal directory
mkdir -p postal/config

# Create postal.yml config
cat > postal/config/postal.yml << 'EOF'
web:
  host: postal.bowerycreative.local
  protocol: http

general:
  use_local_ns_for_domains: false

main_db:
  host: postal-mariadb
  username: postal
  password: BoweryPostal2024
  database: postal

message_db:
  host: postal-mariadb
  username: postal
  password: BoweryPostal2024
  database: postal_messages

rabbitmq:
  host: postal-rabbitmq
  username: postal
  password: BoweryRabbit2024
  vhost: postal

smtp:
  host: 0.0.0.0
  port: 25

dns:
  mx_records:
    - mx.postal.bowerycreative.local
  smtp_server_hostname: postal.bowerycreative.local
  spf_include: spf.postal.bowerycreative.local
  return_path: rp.postal.bowerycreative.local
  route_domain: routes.postal.bowerycreative.local
  track_domain: track.postal.bowerycreative.local
EOF

# Create initialization script
cat > postal/initialize-postal.sh << 'EOF'
#!/bin/bash
echo "Initializing Postal..."

# Wait for database
sleep 10

# Initialize database
postal initialize

# Create admin user
postal make-user <<END
admin@bowerycreativeagency.com
Admin
User
BoweryCreative2024!
END

# Start postal
postal start
EOF

chmod +x postal/initialize-postal.sh

echo "✅ Postal configuration created"
echo ""
echo "To start Postal:"
echo "1. Run: docker-compose up -d"
echo "2. Wait 30 seconds for services to start"
echo "3. Access web UI at http://localhost:5000"
echo "4. Login: admin@bowerycreativeagency.com / BoweryCreative2024!"
echo ""
echo "Add to your .env file:"
echo "POSTAL_HOST=localhost"
echo "POSTAL_PORT=25"
echo "POSTAL_API_KEY=<get from Postal UI after login>"