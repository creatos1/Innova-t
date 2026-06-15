console.log(`
Este proyecto ya no crea usuarios hardcodeados desde el cliente.

Usa el script seguro con Firebase Admin:

PowerShell:
$env:ADMIN_EMAIL="admin@tu-dominio.com"
$env:ADMIN_PASSWORD="CambiaEstaClave123!"
$env:ADMIN_NAME="Direccion Innova-T"
npm run crear-usuarios

Requiere serviceAccountKey.json en la raiz del proyecto.
`)
