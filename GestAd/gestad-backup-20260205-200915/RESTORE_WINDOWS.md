# 🪟 Restauration GestAd sur Windows

## Prérequis
- Docker Desktop pour Windows (https://www.docker.com/products/docker-desktop)
- PowerShell ou Git Bash
- 4 GB RAM minimum
- Ports 3001 et 3306 disponibles

## Installation Complète

### Étape 1 : Extraire l'archive
```powershell
# Avec tar natif Windows 10/11
tar -xzf gestad-backup-XXXXXXXX.tar.gz
cd gestad-backup-XXXXXXXX

# OU avec 7-Zip (si installé)
7z x gestad-backup-XXXXXXXX.tar.gz
7z x gestad-backup-XXXXXXXX.tar
cd gestad-backup-XXXXXXXX
