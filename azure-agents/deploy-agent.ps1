# Set working directory to the folder containing your Dockerfile and docker-compose.yml
Set-Location "D:\Azure-Build-Agents"

# Step 1: Build the Docker image
$ImageName = "azp-agent"
Write-Host "🔧 Building Docker image: $ImageName..."
docker build -t $ImageName .

# Step 2: Start agents with Docker Compose
Write-Host "🚀 Starting agents with docker-compose..."
docker-compose up -d

# Step 3: Show running containers
Write-Host "📦 Running containers:"
docker ps | Where-Object { $_ -match $ImageName }