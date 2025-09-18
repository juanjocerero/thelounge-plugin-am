# Bot TheLounge

# Plan de Desarrollo: Plugin de Bot para TheLounge

Este documento sirve como guía para un LLM pair programmer en la creación de un plugin de bot para TheLounge. El objetivo es seguirlo paso a paso para desarrollar, probar, desplegar y monitorizar el plugin.

---

## Sección 1: Configuración del proyecto y estructura básica

- **Objetivo:** Crear la estructura de directorios y los ficheros iniciales necesarios para que TheLounge reconozca nuestro proyecto como un plugin válido.

### Paso 1.1: Crear el directorio del proyecto

- **Acción:** Crea un nuevo directorio para el plugin. El nombre debe seguir la convención de TheLounge: `thelounge-plugin-NOMBRE`. Lo llamaremos `thelounge-plugin-answering-machine`.
- **Razonamiento:** TheLounge identifica los plugins por este prefijo en el nombre del paquete de `npm`. Seguir la convención es esencial para que sea detectable.

### Paso 1.2: Inicializar el proyecto de Node.js

- **Acción:** Dentro del directorio, ejecuta `npm init -y`. Esto creará un fichero `package.json` con valores por defecto.
- **Razonamiento:** Todo plugin de TheLounge es un paquete de Node.js. El `package.json` gestiona las dependencias y la información del proyecto, y es el fichero que TheLounge lee para identificar el plugin.

### Paso 1.3: Modificar `package.json`

- **Acción:** Edita el fichero `package.json` para añadir las propiedades `thelounge` y `main`, y corregir el nombre.
    
    ```json
    {
      "name": "thelounge-plugin-answering-machine",
      "version": "1.0.0",
      "description": "A plugin for TheLounge that answers messages automatically based on server/channel rules.",
      "main": "index.js",
      "thelounge": {
    	  "name:": "answering-machine",
        "type": "plugin",
        "supports": ">=4.0.0"
      },
      "dependencies": {
        "thelounge": "^4.0.0"
      },
      "engines": {
        "node": ">=14.0.0"
      },
      "keywords": [
        "thelounge",
        "thelounge-plugin",
        "irc",
        "monitor",
        "bot"
      ],
      "author": "juanjocerero",
      "license": "MIT"
    }
    ```
    
- **Razonamiento:**
    - `"main": "index.js"`: Indica a Node.js cuál es el fichero de entrada de nuestro paquete.
    - `"thelounge": { "type": "plugin" }`: Es una propiedad **obligatoria** que TheLounge usa para confirmar que este paquete es un plugin que debe cargar.

### — Un ejemplo de plugin existente —

```jsx
// Ejemplo de un plugin existente
{
  "name": "thelounge-plugin-chanmon",
  "version": "2.5.1",
  "description": "A plugin for TheLounge that creates a local channel monitor to stream all channel activity in real-time",
  "main": "index.js",
  "keywords": [
    "thelounge",
    "irc",
    "thelounge-plugin",
    "channel",
    "monitor",
    "chanmon"
  ],
  "author": "jjasghar",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jjasghar/thelounge-plugin-chanmon.git"
  },
  "homepage": "https://github.com/jjasghar/thelounge-plugin-chanmon#readme",
  "bugs": {
    "url": "https://github.com/jjasghar/thelounge-plugin-chanmon/issues"
  },
  "thelounge": {
    "name": "ChanMon",
    "type": "plugin",
    "supports": ">=4.0.0"
  },
  "dependencies": {
    "thelounge": "^4.0.0"
  },
  "engines": {
    "node": ">=14.0.0"
  },
  "devDependencies": {
    "mocha": "^10.0.0",
    "chai": "^4.3.0"
  },
  "scripts": {
    "test": "mocha test/*.test.js",
    "test:basic": "mocha test/simple.test.js",
    "test:integration": "mocha test/integration.test.js",
    "test:unit": "mocha test/unit.test.js"
  }
}
```

### Paso 1.4: Crear el `index.js`

- **Acción:** Crea un fichero vacío llamado `index.js` en la raíz del proyecto.
- **Razonamiento:** Este será el punto de entrada de toda la lógica de nuestro plugin, como se definió en el `package.json`.

---

## Sección 2: Inicialización del plugin y carga de configuración

- **Objetivo:** Implementar el esqueleto básico del plugin, asegurarnos de que se carga correctamente y de que puede leer su configuración desde un fichero externo.

### Paso 2.1: Implementar el punto de entrada `onServerStart`

- **Acción:** En `index.js`, exporta una función `onServerStart` que reciba el objeto `api` y un objeto de utilidades `helper`. Añade un log para confirmar que se ha cargado.
    
    ```jsx
    "use strict";
    
    module.exports = {
        onServerStart: function(api, helper) {
            console.info("[answering-machine] Plugin loaded. Running onServerStart.");
        }
    };
    ```
    
- **Razonamiento:** `onServerStart` es la función que TheLounge llama cuando carga el plugin. Es nuestro único punto de entrada para obtener acceso a la API (`api`) y configurar toda nuestra lógica. El log inicial es crucial para verificar que el plugin se ha instalado y cargado correctamente en TheLounge.

### Paso 2.2: Crear el fichero de reglas `rules.json`

- **Acción:** En la raíz del proyecto, crea un fichero `rules.json` con una estructura de ejemplo.
    
    ```json
    [
      {
        "server": "irc.libera.chat",
        "listen_channel": "#thelounge-test",
        "trigger_text": "!test",
        "response_message": "Test message received. The bot is answering.",
        "response_channel": ""
      }
    ]
    ```
    
- **Razonamiento:** Externalizar las reglas hace que el plugin sea flexible y fácil de configurar por el usuario final sin necesidad de modificar el código. Empezamos con una regla simple para facilitar las pruebas iniciales.

### Paso 2.3: Implementar la Lógica de Lectura de Configuración

- **Acción:** En `index.js`, usa el módulo `fs` de Node.js para leer y parsear `rules.json`. Envuelve la lógica en un `try...catch` para manejar errores y añade logs detallados.
    
    ```jsx
    "use strict";
    
    const fs = require("fs");
    const path = require("path");
    
    module.exports = {
        onServerStart: function(api, helper) {
            console.info("[answering-machine] Plugin loaded. Running onServerStart.");
    
            let rules = [];
            try {
                const rulesPath = path.join(__dirname, "rules.json");
                const rulesFile = fs.readFileSync(rulesPath, "utf8");
                rules = JSON.parse(rulesFile);
                console.info(`[answering-machine] Rules file loaded successfully. Found ${rules.length} reglas.`);
            } catch (error) {
                console.error("[answering-machine] Error reading or parsing rules.json. The plugin won't work.", error);
                return; // Detenemos la ejecución si no hay reglas
            }
    
            // El resto de la lógica irá aquí...
        }
    };
    ```
    
- **Razonamiento:**
    - Usamos `path.join(__dirname, "rules.json")` para construir una ruta absoluta al fichero, lo que evita problemas sin importar desde dónde se ejecute TheLounge.
    - El bloque `try...catch` es fundamental para la robustez. Si el fichero no existe o contiene JSON inválido, el plugin lo notificará en los logs y se detendrá de forma segura en lugar de crashear el servidor de TheLounge.

---

## Sección 3: Lógica Central - Escucha de Mensajes

- **Objetivo:** Enganchar la lógica del bot a las conexiones de IRC de los usuarios para poder "escuchar" los mensajes que llegan.

### Paso 3.1: Acceder al `clientManager` e Iterar sobre Usuarios Conectados

- **Acción:** Dentro de `onServerStart` (después de cargar las reglas), obtén el `clientManager` desde `api` y recorre la lista de clientes (usuarios) que ya están en línea.
    
    ```jsx
    // Dentro de onServerStart, después del bloque try...catch
    
    const clientManager = api.clientManager;
    const clients = clientManager.clients;
    
    console.log(`[answering-machine] Found ${clients.length} clients connected.`);
    
    for (const client of clients) {
        for (const network of client.networks) {
            // Lógica para enganchar el listener
        }
    }
    ```
    
- **Razonamiento:** El plugin puede iniciarse cuando ya hay usuarios conectados. Necesitamos iterar sobre ellos para aplicar nuestra lógica de escucha de inmediato, en lugar de esperar a que se reconecten.

### Paso 3.2: Crear la Función para Enganchar el Listener

- **Acción:** Crea una función reutilizable llamada `attachListener`. Esta función recibirá `client`, `network`, `rules` y la `api`. Dentro, se definirá el listener para el evento `privmsg`.
    
    ```jsx
    function attachListener(client, network, rules, api) {
        console.log(`[answering-machine] Attaching listener to network '${network.name}' for user '${client.name}'.`);
    
        network.irc.on("privmsg", (data) => {
            // La lógica de procesamiento de mensajes irá aquí...
            console.log(`[answering-machine] Message received on ${data.target}: <${data.nick}> ${data.message}`);
        });
    }
    ```
    
- **Razonamiento:** Crear una función separada nos permite reutilizarla para los usuarios ya conectados (Paso 3.3) y para los que se conecten en el futuro (Paso 3.4), manteniendo el código limpio (principio DRY: Don't Repeat Yourself). El log dentro del listener es un primer paso para depurar y confirmar que estamos recibiendo los mensajes.

### Paso 3.3: Llamar a `attachListener` para los Usuarios Existentes

- **Acción:** Dentro del bucle del Paso 3.1, llama a la nueva función `attachListener`.
    
    ```jsx
    // ... dentro del bucle
    for (const client of clients) {
        for (const network of client.networks) {
            attachListener(client, network, rules, api);
        }
    }
    ```
    
- **Razonamiento:** Con esto completamos la lógica para manejar las sesiones activas en el momento del arranque del plugin.

### Paso 3.4: Escuchar por Nuevas Conexiones de Red

- **Acción:** Suscríbete al evento `network:new` del `clientManager` para enganchar el listener a cualquier nueva sesión de IRC que inicie un usuario.
    
    ```jsx
    // Dentro de onServerStart, después del bucle
    clientManager.on("network:new", (data) => {
        console.log(`[answering-machine] New network detected for user '${data.client.name}'.`);
        attachListener(data.client, data.network, rules, api);
    });
    ```
    
- **Razonamiento:** Esto hace que nuestro plugin sea dinámico. Si un usuario se conecta a un nuevo servidor de IRC mientras TheLounge está en marcha, nuestro bot se enganchará automáticamente sin necesidad de reiniciar nada.

---

## Sección 4: Lógica de Procesamiento y Respuesta

- **Objetivo:** Implementar la lógica que se ejecuta para cada mensaje recibido: comprobar si cumple alguna regla y, en caso afirmativo, enviar la respuesta correspondiente.

### Paso 4.1: Implementar la Lógica de Filtrado de Mensajes

- **Acción:** Dentro del listener `privmsg` en la función `attachListener`, añade la lógica completa para iterar sobre las reglas y comprobar si el mensaje cumple todas las condiciones.
    
    ```jsx
    // Dentro de network.irc.on("privmsg", (data) => { ... })
    
    // 1. Evitar bucles: no responder a uno mismo
    if (data.nick === network.irc.user.nick) {
        return;
    }
    
    // 2. Iterar sobre las reglas
    for (const rule of rules) {
        const serverMatch = rule.server === network.name;
        const channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();
        const textMatch = data.message.includes(rule.trigger_text);
    
        if (serverMatch && channelMatch && textMatch) {
            // Lógica de respuesta irá aquí
            console.log(`[answering-machine] Rule triggered! By user '${data.nick}' on '${data.target}'.`);
            break; // Salimos del bucle para no procesar más reglas en este mensaje
        }
    }
    
    ```
    
- **Razonamiento:**
    - La comprobación `data.nick === network.irc.user.nick` es **crítica** para evitar que el bot se responda a sí mismo en un bucle infinito.
    - Se comprueban las tres condiciones (servidor, canal, texto) de forma explícita. Usar `.toLowerCase()` en los canales los hace insensibles a mayúsculas/minúsculas, lo que es una práctica común en IRC.
    - El `break` es una optimización importante: una vez que una regla se cumple, no necesitamos seguir comprobando las demás para el mismo mensaje.

### Paso 4.2: Implementar el Envío de la Respuesta

- **Acción:** Cuando una regla se cumple, determina el canal de destino, construye el comando `PRIVMSG` y usa `api.client.runAsUser` para enviarlo.
    
    ```jsx
    // Dentro del if (serverMatch && channelMatch && textMatch) { ... }
    
    const targetChannel = rule.response_channel || data.target;
    const command = `PRIVMSG ${targetChannel} :${rule.response_message}`;
    
    console.log(`[answering-machine] Sending response to '${targetChannel}': ${rule.response_message}`);
    
    api.client.runAsUser(command, client.uuid);
    break;
    
    ```
    
- **Razonamiento:**
    - `rule.response_channel || data.target` implementa de forma concisa el requisito de usar el canal de origen si el de respuesta está vacío.
    - `api.client.runAsUser` es la función oficial de la API para que un plugin actúe en nombre del usuario. Necesita el comando IRC en crudo y el UUID del cliente para saber quién está realizando la acción.

---

## Sección 5: Testeo, Despliegue y Monitorización

- **Objetivo:** Definir los pasos para verificar que el plugin funciona correctamente, instalarlo en un entorno de producción y observar su comportamiento.

### Paso 5.1: Plan de Testeo Local

- **Acción:**
    1. Instala TheLounge en tu máquina de desarrollo.
    2. Instala el plugin localmente desde su directorio: `thelounge install /ruta/a/thelounge-plugin-answering-machine`.
    3. Inicia TheLounge (`thelounge start`) y revisa los logs de arranque para confirmar que el plugin se carga sin errores y lee las reglas.
    4. Conéctate a TheLounge con un cliente de IRC.
    5. Únete al servidor y canal definidos en `rules.json` (ej: `irc.libera.chat`, `#thelounge-test`).
    6. Escribe el texto de activación (ej: `!test`) y verifica que el bot responde como se espera.
    7. Prueba el caso de un canal de respuesta diferente.
    8. Provoca errores (ej: borra `rules.json` o introduce JSON inválido) y comprueba que el plugin lo registra en los logs y no crashea.
- **Razonamiento:** Un testeo local sistemático es la forma más rápida y segura de encontrar y corregir errores antes de pasar a un entorno real.

### Paso 5.2: Guía de Despliegue

- **Acción:**
    1. Publica el plugin en `npm` (opcional, para distribución pública) o copia el directorio del plugin al servidor de producción.
    2. En el servidor de producción, navega al directorio de configuración de TheLounge (ej: `/var/opt/thelounge`).
    3. Instala el plugin usando su nombre de npm (`thelounge install thelounge-plugin-autobot`) o la ruta local.
    4. Asegúrate de que el fichero `rules.json` está presente en el directorio del plugin instalado (`node_modules/thelounge-plugin-autobot`).
    5. Reinicia el servicio de TheLounge (ej: `sudo systemctl restart thelounge`).
- **Razonamiento:** El proceso de instalación en producción es idéntico al local, pero requiere reiniciar el servicio para que TheLounge detecte y cargue el nuevo plugin.

### Paso 5.3: Monitorización

- **Acción:**
    1. Una vez desplegado, monitoriza los logs de TheLounge para ver los mensajes de tu plugin.
    2. Usa el comando adecuado según cómo se ejecute TheLounge (ej: `sudo journalctl -u thelounge -f`).
    3. Para aislar los logs del plugin, filtra la salida: `sudo journalctl -u thelounge -f | grep "\\[answering-machine\\]"`.
- **Razonamiento:** La monitorización activa post-despliegue es clave para asegurar que el plugin se comporta como se espera en un entorno real y para diagnosticar rápidamente cualquier problema que pueda surgir. Los logs que hemos añadido en cada paso del desarrollo son la herramienta principal para esta tarea.

### Referencias

https://thelounge.chat/docs/api/public-client

https://github.com/jjasghar/thelounge-plugin-chanmon/tree/main

https://thelounge.chat/docs/usage#installing-local-packages [Installing Local Packages]
