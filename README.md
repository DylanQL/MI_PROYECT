# DataPilot MVC (Node + WebSocket)

Aplicacion MVC con Node.js, Express, MySQL y WebSocket para gestionar tablas y registros en tiempo real.

## Funciones incluidas

- Login (sin registro publico)
- Registro por correo corporativo con codigo de verificacion
- Edicion de perfil: username, nombres, apellidos y contrasena
- Menu principal con:
  - Seleccionar tabla
  - Crear tabla
  - Editar tabla (agregar/modificar/borrar campos)
  - Borrar tabla
  - Anadir registro
- Carga de registros con paginacion
- Filtros dinamicos ilimitados por campos
- Actualizacion en tiempo real via WebSocket
- Diseno responsive con iconos

## Seguridad aplicada

- Se bloquea la tabla `users` y la tabla de sesiones `app_sessions` para que no aparezcan ni se puedan manipular desde la app.
- Validacion de identificadores SQL para reducir riesgo de inyeccion.

## Requisitos

- Node.js 18+
- MySQL accesible

## Configuracion

La configuracion actual se toma desde `.env`.

Variables:

- `MYSQL_ADDON_HOST`
- `MYSQL_ADDON_DB`
- `MYSQL_ADDON_USER`
- `MYSQL_ADDON_PORT`
- `MYSQL_ADDON_PASSWORD`
- `SESSION_SECRET`
- `PORT`
- `GMAIL_SENDER_EMAIL`
- `GMAIL_APP_PASSWORD`
- `REGISTER_ALLOWED_DOMAIN`

## Instalacion y ejecucion

```bash
npm install
npm run dev
```

Produccion:

```bash
npm start
```

## Esquema recomendado para users

Si aun no tienes la tabla de usuarios:

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  nombres VARCHAR(120) NULL,
  apellidos VARCHAR(120) NULL,
  password VARCHAR(255) NOT NULL
);
```

Para insertar un usuario con contrasena hasheada, genera hash bcrypt y guardalo en `password`.

Ejemplo rapido de hash:

```bash
node -e "require('bcrypt').hash('TuPasswordSegura', 10).then(console.log)"
```

Luego inserta el hash en tu tabla `users`.

## Registro por correo

Flujo implementado:

1. El usuario abre `/register` e ingresa su correo.
2. Solo se permite continuar si el dominio coincide con `REGISTER_ALLOWED_DOMAIN` (por defecto `scania.com`).
3. Al pasar a la siguiente pantalla se muestran dos botones:
  - Enviar codigo
  - Ya tengo un codigo
4. El codigo expira en 5 minutos.
5. No se puede reenviar codigo antes de 1 minuto (se muestra contador y boton desactivado).
6. Al verificar codigo valido, el sistema genera una contrasena aleatoria, crea o actualiza usuario y envia la contrasena al correo.

## Rutas principales

- `GET /login`
- `POST /login`
- `GET /register`
- `POST /register/status`
- `POST /register/send-code`
- `POST /register/verify-code`
- `POST /logout`
- `GET /` (dashboard)
- `GET /profile`
- `POST /profile`

API autenticada:

- `GET /api/tables`
- `POST /api/tables`
- `PUT /api/tables/:tableName/edit`
- `DELETE /api/tables/:tableName`
- `GET /api/tables/:tableName/columns`
- `GET /api/tables/:tableName/records?page=1&pageSize=10&campo=valor`
- `POST /api/tables/:tableName/records`
