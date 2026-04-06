# Tidslinjal Manual de Usuario

**Versión 8.3.0**

---

## Tabla de contenidos

1. [Descripción general](#1-descripción-general)
2. [Primeros pasos](#2-primeros-pasos)
3. [La interfaz](#3-la-interfaz)
4. [Navegar por la línea de tiempo](#4-navegar-por-la-línea-de-tiempo)
5. [Eventos](#5-eventos)
6. [Flujo de trabajo del estado de eventos](#6-flujo-de-trabajo-del-estado-de-eventos)
7. [Comentarios](#7-comentarios)
8. [Capas](#8-capas)
9. [Alarmas y notificaciones](#9-alarmas-y-notificaciones)
10. [Ejercicio y tiempo sintético](#10-ejercicio-y-tiempo-sintético)
11. [Fases del ejercicio](#11-fases-del-ejercicio)
12. [Bloqueo de franjas horarias](#12-bloqueo-de-franjas-horarias)
13. [Roles y permisos](#13-roles-y-permisos)
14. [Configuración](#14-configuración)
15. [Exportación e informes](#15-exportación-e-informes)
16. [Vista de administración](#16-vista-de-administración)
17. [Relojes, cuentas atrás y cronómetros](#17-relojes-cuentas-atrás-y-cronómetros)
18. [Registro de decisiones](#18-registro-de-decisiones)
19. [Libro de registro](#19-libro-de-registro)
20. [Gestión de recursos](#20-gestión-de-recursos)
21. [Proyección de mapa](#21-proyección-de-mapa)
22. [Ventanas desprendibles](#22-ventanas-desprendibles)
23. [Integraciones y conectores](#23-integraciones-y-conectores)
24. [Plantillas](#24-plantillas)
25. [Atajos de teclado y ratón](#25-atajos-de-teclado-y-ratón)
26. [Solución de problemas](#26-solución-de-problemas)
27. [Referencias y biblioteca de documentos](#27-referencias-y-biblioteca-de-documentos)
28. [Accesibilidad](#28-accesibilidad)
29. [Preajustes del espacio de trabajo](#29-preajustes-del-espacio-de-trabajo)

---

## 1. Descripción general

**Tidslinjal** es una herramienta colaborativa de línea de tiempo operativa basada en web para equipos geográficamente distribuidos. Proporciona una cronología visual compartida de eventos para la planificación de operaciones, coordinación y conciencia situacional — incluyendo soporte para ejercicios militares y de emergencia con tiempo sintético.

Características principales:
- Línea de tiempo compartida multiusuario con acceso basado en roles
- Gestión del ciclo de vida de eventos con flujo de trabajo de aprobación
- Capas con nombre para separar flujos de actividad
- Soporte de ejercicios con STARTEX/ENDEX y tiempo sintético "Día N / T+T"
- Notificaciones de alarma en tiempo real mediante Server-Sent Events
- Exportación a ICS, JSON y CSV
- Formato de fecha militar DTG (Date-Time Group)
- Modo de alto contraste y paletas adaptadas para daltonismo
- Soporte de idioma finés (Suomi)
- Gestión de documentos de referencia con sumas de verificación
- Preajustes del espacio de trabajo

---

## 2. Primeros pasos

### Iniciar sesión

Navegue a `http://<servidor>:<puerto>` (por defecto: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Usuario:    [admin         ]   │
│  Contraseña: [••••••••••••••]   │
│                                 │
│       [ Iniciar sesión ]        │
└─────────────────────────────────┘
```

Credenciales por defecto: `admin` / `admin`

> **Nota de seguridad:** Cambie la contraseña de administrador inmediatamente después del primer inicio de sesión usando el botón 🔑 en la esquina superior derecha.

### Autorregistro

Si el administrador ha habilitado el autorregistro, el enlace **"¿No tiene cuenta? Regístrese"** aparecerá en la página de inicio de sesión. Hay cuatro modos de registro:

| Modo | Descripción |
|---|---|
| **Abierto** | Cualquiera puede registrarse; la cuenta se activa de inmediato |
| **Revisado** | Cualquiera puede registrarse; el administrador debe aprobar la cuenta antes de permitir el inicio de sesión |
| **Invitación general** | El registro requiere un código de invitación compartido proporcionado por el administrador |
| **Invitación personal** | El registro requiere un código de un solo uso generado por el administrador para cada usuario |

### Restablecimiento de contraseña

Si ha registrado una dirección de correo electrónico en su perfil:

1. Haga clic en **¿Olvidó su contraseña?** en la página de inicio de sesión
2. Introduzca su nombre de usuario o dirección de correo electrónico
3. Se genera un token de restablecimiento (se muestra en pantalla si no hay servidor de correo configurado)
4. Haga clic en **Restablecer contraseña**, pegue el token y elija una nueva contraseña

### Cambio de contraseña

Haga clic en el botón **🔑** en el encabezado. Introduzca su contraseña actual y luego su nueva contraseña dos veces.

---

## 3. La interfaz

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Hoy] [›] [⏱]  Vista: [Semana▼]  Res.: [Hora▼]    │
│             [🔍 Buscar…] [🗂 Capas] [⬇ Exportar] [📄 Informe]        │
│                          [👤 Nombre  rol] [?][🔑][☰] [Cerrar sesión] │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  PANEL LATERAL  │
│                CUADRÍCULA DE LÍNEA DE TIEMPO       │                 │
│  Hora │  Lun 01  │  Mar 02  │  Mié 03  │  ...     │  [Leyenda]      │
│ ──────┼──────────┼──────────┼──────────┤          │  [Alarmas]      │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Capas]        │
│ 09:00 │          │ Revisión │          │          │  [Configuración]│
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Encabezado** — navegación, selección de vista, búsqueda y controles de usuario.

**Cuadrícula de línea de tiempo** — días de izquierda a derecha, tiempo de arriba hacia abajo. Los eventos se muestran como bloques de color.

**Panel lateral** — pestañas de Leyenda, Alarmas, Capas, Usuarios (admin), Grupos (admin), Registro de auditoría (Jefe de equipo+), Fases (Jefe de equipo+), Configuración. Alternar con el botón ☰.

---

## 4. Navegar por la línea de tiempo

### Navegación por fecha

| Control | Acción |
|---|---|
| Botones **‹** / **›** | Avanzar / retroceder un intervalo de vista |
| Botón **Hoy** | Saltar al día de hoy |
| Botón **⏱** | Desplazar la cuadrícula a la hora actual |

### Intervalo de vista

Use el menú desplegable **Vista** en la barra de herramientas:

```
Vista: [Día ▼]
        Día
        2 Días
        3 Días
        4 Días
      ▶ Semana
        Mes
        2 Meses
        3 Meses
```

### Resolución (altura de franja)

Use el menú desplegable **Resolución**:

```
Resolución: [Hora ▼]
             10 min
             15 min
           ▶ Hora
             Día
```

### Zoom

**Arrastrar para hacer zoom** — haga clic y arrastre hacia arriba/abajo en la columna de tiempo (borde izquierdo) para aumentar o disminuir la altura de franja. Arrastre **hacia arriba** para acercar, **hacia abajo** para alejar.

**Doble clic** en la columna de tiempo para restablecer el zoom a 1×.

Teclado: **+** / **-** para acercar/alejar en incrementos.

### Desplazamiento horizontal

Haga clic con el botón central y arrastre en el área de la línea de tiempo para desplazarse a izquierda/derecha.

---

## 5. Eventos

### Crear un evento

Haga clic en una celda vacía de la cuadrícula de la línea de tiempo o haga clic en **+ Añadir evento** en el encabezado.

```
┌─────────────────────── Añadir evento ─────────────────────────────┐
│ Título *  [                                                      ]  │
│                                                                      │
│ Tipo      [Actividad       ▼]   Color  [■]                          │
│                                                                      │
│ Inicio *  [2025-06-01T10:00]    Fin    [2025-06-01T11:00]           │
│                                                                      │
│ Capa     [Línea maestra    ▼]  Estado [Planificado      ▼]         │
│                                                                      │
│ Descripción                                                          │
│ [                                                                ]   │
│                                                                      │
│ Participantes  [—  ▼]   ☐ Evento de día completo (sin hora)         │
│                                                                      │
│ ☐ Recurrente    Patrón [Semanal ▼]                                   │
│ Fecha fin  [               ]                                         │
│                                                                      │
│ Adjunto 📎 [Seleccionar archivo]                                     │
│                                                                      │
│              [Cancelar]   [Guardar]                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Tipos de evento

Cada tipo de evento tiene un bloque de color y un icono que se muestra a la **izquierda** del título del evento.

| Icono | Tipo | Color | Notas |
|---|---|---|---|
| — | **Evento** | Azul | Ocurrencia general |
| ⚡ | **Instante** | Naranja | Punto único en el tiempo — sin hora de fin. Se renderiza como un marcador ◆ de diamante. |
| 🤝 | **Reunión** | Gris | Reunión programada |
| 🏢 | **Reunión presencial** | Naranja quemado | Reunión presencial en un lugar específico |
| ⚖️ | **Decisión** | Verde | Punto de decisión |
| ⏰ | **Fecha límite** | Rojo | Plazo estricto |
| — | **Actividad** | Verde | Bloque de trabajo |
| 🔄 | **Repetitivo** | Púrpura | Plantilla para actividades recurrentes |
| 📊 | **Informe** | Azul verdoso | Informe o revisión |
| 📌 | **Tarea asignada** | Naranja | Tarea asignada a una persona o equipo |
| 🧍 | **Reunión diaria** | Cian | Breve reunión diaria de estado |

El icono ↻ (a la izquierda del título) indica que el evento es parte de una **serie recurrente**. Los tipos personalizados pueden tener su propio icono emoji configurado mediante **Configuración → Tipos de evento → Editar**.

Active/desactive todos los iconos globalmente en **Configuración → Iconos de evento**.

Los tipos personalizados pueden ser añadidos por usuarios con Lectura/Escritura+ desde el panel de configuración.

### Eventos instantáneos

Cuando se selecciona **Instante** como tipo:
- El campo **Fin** se oculta (sin duración)
- El evento se renderiza como un marcador vertical estrecho con un ◆ diamante en la parte superior
- No se puede configurar como recurrente

### Eventos de día completo

Marque **Evento de día completo (sin hora)** para un evento que abarca todo el día:
- Los campos de hora de inicio/fin se ocultan
- El evento aparece en la zona gris fuera del horario diario
- La recurrencia no está disponible para eventos de día completo

### Participantes

El campo **Participantes** indica si la actividad involucra partes internas o externas:

| Valor | Etiqueta | Color |
|---|---|---|
| — | ninguna | — |
| **Interno** | `INTERNO` | Azul verdoso |
| **Externo** | `EXTERNO` | Rojo |

### Eventos recurrentes

Marque **Recurrente**, luego seleccione un patrón:

| Patrón | Intervalo |
|---|---|
| Cada 30 minutos | 30 minutos |
| Cada hora | 1 hora |
| Cada 2 / 3 / 4 horas | 2 / 3 / 4 horas |
| Diario | 1 día |
| Semanal | 7 días |
| Mensual | ~1 mes |
| Trimestral | ~3 meses |

### Editar y eliminar eventos

Haga clic en un bloque de evento para abrir la vista de detalle. Haga clic en **Editar** para modificar. Haga clic en **Eliminar** (visible para el creador y administradores) para eliminar.

---

## 6. Flujo de trabajo del estado de eventos

Cada evento tiene un estado que avanza a través de un ciclo de vida:

```
planificado ──► activo ──► respondido ──► finalizado ──► enviado
                                                            │
                                                 ┌──────────┤
                                                 ▼          ▼
                                             verificado  rechazado
                                                            │
                                                      (motivo requerido)
```

`cancelado` está disponible en cualquier etapa.

### Transiciones

| De → A | Quién puede actuar |
|---|---|
| Cualquiera → cualquiera (excepto verificar/rechazar) | Creador, Jefe de equipo+ |
| respondido | Informador, Creador, Jefe de equipo+ |
| enviado → verificado | Jefe de equipo+ (registra quién y cuándo) |
| enviado → rechazado | Jefe de equipo+ (requiere motivo de rechazo) |

### Rol de informador

Los usuarios con el rol **Informador** pueden:
- Publicar comentarios en eventos
- Establecer el estado como `respondido` o `finalizado` (requiere aprobación del Jefe de equipo)

---

## 7. Comentarios

Haga clic en un bloque de evento para abrir la vista de detalle. Desplácese hacia abajo hasta **Comentarios**.

- Todos los usuarios autenticados pueden leer comentarios
- Los usuarios con Lectura/Escritura+ pueden publicar comentarios
- Los informadores pueden publicar comentarios; los comentarios que cambian el estado requieren aprobación
- Los Jefes de equipo+ pueden aprobar o eliminar comentarios pendientes

---

## 8. Capas

Las capas son superposiciones con nombre sobre la línea maestra. Permiten que diferentes equipos tengan pistas de eventos separadas con una vista compartida.

### Crear una capa

1. Abra la pestaña **Capas** en el panel lateral o haga clic en **🗂 Capas** en la barra de herramientas
2. Haga clic en **+ Nueva capa**
3. Introduzca nombre, color, descripción, visibilidad y permisos

```
┌──────── Nueva capa ───────────┐
│ Nombre *   [Equipo Ciber    ] │
│ Color      [■ #9B59B6       ] │
│ Descripción [               ] │
│                               │
│ Visibilidad  [Grupos     ▼]  │
│ Permiso      [Lect/Escr  ▼]  │
│ Grupos    ☐ Alpha  ☐ Bravo   │
│                               │
│        [Cancelar]  [Guardar]  │
└───────────────────────────────┘
```

### Visibilidad

| Configuración | Quién puede ver la capa |
|---|---|
| **Privada** | Solo el propietario |
| **Grupos** | Propietario + miembros de los grupos seleccionados |
| **Pública** | Todos los usuarios autenticados |

### Alternar capas

Haga clic en **🗂 Capas** en la barra de herramientas para abrir el panel de alternancia rápida. Haga clic en un elemento para alternarlo. Varias capas pueden estar activas simultáneamente — marque las casillas de las capas que desea ver.

---

## 9. Alarmas y notificaciones

### Configurar una alarma

1. Haga clic en un bloque de evento para abrir la vista de detalle
2. Haga clic en **🔔 Configurar alarma**
3. Seleccione el tiempo de anticipación (en el momento, 5/10/15/30 min, o 1 hora antes)

### Notificaciones de alarma

Cuando una alarma se activa, se muestra un panel de notificación en la parte superior de la pantalla:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarma — "Revisión ENDEX" en 15 minutos (10:45)                    │
│                    [Cerrar] [📋 Ver evento] [✓ ACK]                  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Cerrar** — elimina la notificación sin acuse de recibo.
- **📋 Ver evento** — abre la vista de detalle del evento directamente desde la alarma.
- **✓ ACK** — acusa recibo de la alarma y detiene la escalación.
- Botón **Ir a reunión** — si el evento es una reunión con URL (Teams/Zoom), se muestra un botón en la notificación de alarma que abre la reunión directamente.

Las alarmas no acusadas escalan — se vuelven naranjas, luego rojas parpadeantes cada 60 segundos.

### Registro de auditoría de alarmas

Cada acuse de recibo de alarma se registra en el **Registro de auditoría** (accesible para Jefe de equipo y superiores). Cada entrada incluye:
- Quién acusó recibo de la alarma (nombre de usuario e ID)
- Cuándo ocurrió el acuse de recibo (marca de tiempo)
- La dirección IP desde la que se accedió al sistema en ese momento

### Relojes de múltiples zonas horarias

El encabezado muestra el reloj principal en tiempo real. Puede añadir cualquier cantidad de relojes para otras zonas horarias.

**Añadir un reloj:**
1. Haga clic en el botón **+** a la izquierda del reloj principal en el encabezado.
2. Introduzca una etiqueta corta (p. ej. *Tallinn*, *Kyiv*, *Kabul*).
3. Seleccione la zona horaria IANA en el menú desplegable.
4. Haga clic en **Añadir**. El reloj aparece inmediatamente a la izquierda del reloj principal.

**Eliminar un reloj:** Haga clic en **×** en el widget del reloj, o vaya a **Configuración → Formato de fecha/hora → Zonas horarias adicionales → Eliminar**.

### Notificaciones webhook

Configure una URL de webhook en **Configuración** para recibir también notificaciones de alarma mediante HTTP POST a Mattermost, Slack o cualquier endpoint HTTP.

### Pestaña de alarmas en el panel lateral

Vea y gestione todas sus alarmas activas desde la pestaña **Alarmas** en el panel lateral.

---

## 10. Ejercicio y tiempo sintético

Para ejercicios de entrenamiento, Tidslinjal soporta un modo de "tiempo sintético" que reemplaza las fechas reales del calendario con etiquetas de día/hora del ejercicio.

### Configuración (Solo administrador)

1. Abra la pestaña **Configuración** en el panel lateral
2. Desplácese hasta **Configuración del ejercicio**
3. Complete:
   - **Nombre del ejercicio** — se muestra como una insignia en el encabezado
   - **STARTEX** — la fecha y hora real que corresponde al "Día 1 T+0"
   - **ENDEX** — la fecha y hora real del fin del ejercicio
4. Marque **Activar visualización de tiempo sintético**
5. Haga clic en **Guardar**

### Activar tiempo sintético

El botón **🕐 T+** aparece en la barra de herramientas cuando el modo de ejercicio está configurado. Haga clic para alternar entre la visualización de tiempo real y sintético.

### Congelación de la línea de tiempo

En el panel de **Configuración**, use **Congelar/pausar la línea de tiempo** para detener el reloj sintético en un momento específico. Haga clic en **Reanudar** para eliminar la congelación.

---

## 11. Fases del ejercicio

Los Jefes de equipo y roles superiores pueden definir bloques con nombre y color que abarcan toda la línea de tiempo para mostrar las fases del ejercicio.

1. Abra la pestaña **Fases** en el panel lateral
2. Haga clic en **+ Nueva fase**
3. Introduzca nombre, color, hora de inicio, hora de fin y orden de visualización (0–9)

Las fases se muestran como bandas de color translúcidas en la parte superior de la cuadrícula de la línea de tiempo.

---

## 12. Bloqueo de franjas horarias

Los administradores y usuarios con la bandera `puede_bloquear` pueden bloquear intervalos de tiempo para impedir la creación de eventos.

1. Haga clic en **🔒 Bloquear franja horaria** en el encabezado (visible para administradores/usuarios con puede_bloquear)
2. Introduzca hora de inicio, hora de fin y motivo

Las franjas horarias bloqueadas se muestran como una superposición de rayas rojas. Los eventos no se pueden crear en franjas horarias bloqueadas.

---

## 13. Roles y permisos

| Rol | Abreviatura | Capacidades |
|---|---|---|
| **Observador** | `observer` | Acceso de solo lectura a la línea de tiempo y eventos — no puede editar, comentar ni bloquear |
| **Lectura** | `read` | Ver línea de tiempo, eventos, capas; configurar alarmas personales |
| **Informador** | `reporter` | + Publicar comentarios; establecer respondido/finalizado (con aprobación) |
| **Lectura/Escritura** | `readwrite` | + Crear/editar propios eventos; crear tipos de evento y capas |
| **Jefe de equipo** | `teamlead` | + Crear grupos; verificar/rechazar eventos enviados; ver registro de auditoría; gestionar fases |
| **Jefe de operaciones** | `oplead` | + Crear/editar/eliminar eventos en la línea maestra |
| **Asistente de estado mayor** | `staffofficer` | Mismos permisos que el Jefe de operaciones — denominación alternativa para personal de estado mayor |
| **Oficial de estado mayor** | `staffofficer_full` | Igual que Asistente de estado mayor, pero requiere al menos una designación J (J1–J9) |
| **Administrador** | `admin` | Acceso completo — gestionar todos los usuarios, roles, bloqueos, configuración de actividades, registro |

La bandera `puede_bloquear` puede asignarse a cualquier usuario independientemente de su rol.

### Designaciones J (Rol de Oficial de estado mayor)

**Oficial de estado mayor** (`staffofficer_full`) requiere al menos una designación J de la OTAN. Las designaciones identifican la rama del estado mayor:

| Código | Rama |
|---|---|
| J1 | Personal |
| J2 | Inteligencia |
| J3 | Operaciones |
| J4 | Logística |
| J5 | Planificación |
| J6 | Comunicaciones |
| J7 | Entrenamiento |
| J8 | Finanzas |
| J9 | Cooperación cívico-militar |

---

## 14. Configuración

Abra la pestaña **Configuración** en el panel lateral para configurar sus preferencias.

### Tema y visualización

| Configuración | Opciones |
|---|---|
| **Tema** | Oscuro / Claro / City Camo / Urban Camo / Sand / Matrix / Sunset / Light Blue Sky / Ocean / Forest / Accessible / Crimson |
| **Tamaño** | Pequeño / Normal / Grande / Enorme |
| **Idioma** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇩🇪 Deutsch / 🇳🇱 Nederlands / 🇫🇮 Suomi / 🇮🇸 Íslenska / 🇩🇰 Dansk / 🇳🇴 Norsk / 🇪🇪 Eesti / 🇱🇻 Latviešu / 🇱🇹 Lietuvių / 🇮🇹 Italiano / 🇪🇸 Español / 🇵🇹 Português / 🇵🇱 Polski / 🇺🇦 Українська / 🇯🇵 日本語 / 🇰🇷 한국어 |
| **Formato de fecha/hora** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Formato de hora** | 24h / 12h |
| **Modo de alto contraste** | Activado / Desactivado |
| **Paleta para daltonismo** | Desactivada / Protanopía / Deuteranopía / Tritanopía |
| **Vista de inicio predeterminada** | Cuadrícula / Lista / Libro de registro / Decisiones / Mapa / Informes |
| **Seguir automáticamente ahora** | Activado / Desactivado |
| **Intervalo predeterminado** | Día / 3 Días / Semana / 2 Semanas / Mes |
| **Resolución predeterminada** | 10 min / 15 min / Hora / Día |
| **La semana comienza** | Lunes / Domingo |
| **Retardo de tooltip** | Inmediato / 200 ms / 500 ms |
| **Confirmar arrastrar-mover** | Activado / Desactivado |
| **Tipo de evento predeterminado** | cualquier tipo configurado |
| **Banner de bienvenida** | se muestra en el primer inicio de sesión |

El idioma también puede cambiarse directamente con los botones de bandera (🇬🇧 🇸🇪 🇫🇷 🇩🇪 🇳🇱 🇫🇮 🇮🇸 🇩🇰 🇳🇴 🇪🇪 🇱🇻 🇱🇹 🇮🇹 🇪🇸 🇵🇹 🇵🇱 🇺🇦 🇯🇵 🇰🇷) en la barra de herramientas.

### Formato de fecha/hora y horas del día

La sección **Formato de fecha/hora** agrupa tanto la selección de formato como la configuración de horas del día:

| Configuración | Descripción |
|---|---|
| **Formato de fecha** | ISO 8601 / UK / FR / SV |
| **Inicio del día** | Primera hora de la jornada laboral |
| **Fin del día** | Última hora de la jornada laboral |

Las franjas horarias fuera del inicio-fin del día se muestran en gris/rayadas.

### Vista predeterminada

Haga clic en uno de los botones de intervalo (Día / 2 Días / 3 Días / 4 Días / Semana) para establecer su vista predeterminada. Cambiar esto también cambia la vista actual de inmediato.

### Visibilidad de tipos de evento

Active/desactive tipos de evento individuales. Los tipos ocultos aparecen atenuados en la línea de tiempo. Los tipos personalizados se pueden crear con el botón **+ Nuevo tipo** (Lectura/Escritura+).

### Indicador de tiempo actual (línea roja)

| Configuración | Descripción |
|---|---|
| Mostrar / Ocultar | Alternar la línea roja |
| Color | Color de la línea (rojo por defecto) |
| Ancho | Grosor de la línea en píxeles |
| Tipo | Sólida / Discontinua / Punteada |
| Etiqueta H+N | Mostrar etiqueta de hora de ejercicio en la línea |

### Webhook / Notificaciones

Introduzca una URL de webhook para recibir notificaciones de alarma como solicitudes HTTP POST:
- **Mattermost** — payload `{"text": "..."}`
- **Slack** — payload `{"text": "..."}`
- **Genérico** — payload JSON completo de alarma

Haga clic en **Probar** para enviar una notificación de prueba.

---

## 15. Exportación e informes

### Exportación

Haga clic en **⬇ Exportar** en la barra de herramientas para abrir el modal de exportación:

| Formato | Contenido |
|---|---|
| **ICS** | Eventos en la vista actual como iCalendar; importar en cualquier aplicación de calendario |
| **JSON** | Exportación completa del sistema (todos los eventos, usuarios, grupos, capas, configuración) — solo administrador |
| **CSV** | Eventos en la vista actual como hoja de cálculo separada por comas |

### Informes

Haga clic en **📄 Informe** para abrir el generador de informes:

| Tipo de informe | Descripción |
|---|---|
| **Revisión posterior a la acción (AAR)** | Resumen de eventos agrupados por estado |
| **Imagen de la línea de tiempo** | Lista cronológica de todos los eventos en el intervalo |
| **Actividad por capa** | Eventos desglosados por capa |

Seleccione **HTML** para ver en el navegador, o **Imprimir/PDF** para imprimir o guardar como PDF.

---

## 16. Vista de administración

Navegue a `/admin-view` (requiere el rol **Administrador**) para un panel de administración dedicado.

---

## 17. Relojes, cuentas atrás y cronómetros

### Relojes de zona horaria
El reloj del encabezado muestra la hora local en tiempo real. Haga clic en **+** para añadir zonas horarias adicionales para equipos distribuidos. Haga clic en **⧉** para desprender todos los relojes en una ventana separada.

### Pantalla VCR de siete segmentos
Los relojes se muestran en estilo retro VCR con pantalla de siete segmentos. Los colores y grosor de los segmentos son configurables.

### Temporizador de cuenta atrás
Cree temporizadores de cuenta atrás que cuentan hacia atrás hasta una hora objetivo:
- Haga clic en **+ Cuenta atrás** en la barra de herramientas de relojes
- Establezca la hora objetivo o selecciónela desde la hora de inicio/fin de un evento
- La cuenta atrás muestra el tiempo restante con un **indicador de progreso**
- Se activa una alarma cuando la cuenta atrás llega a cero
- Haga clic en **ACK** para confirmar

### Cronómetro
Cree cronómetros que cuentan hacia arriba:
- Haga clic en **+ Cronómetro** en la barra de herramientas de relojes
- Configure: duración (horas/minutos/segundos), botones preestablecidos (5/10/15/30/60 min)
- Elija si el cronómetro debe detenerse o continuar después de la hora objetivo
- Active la alarma sonora al alcanzar la hora objetivo
- El cronómetro muestra un **indicador de progreso** con marcación de tiempo extra

### Selector de color
La barra de herramientas de relojes contiene selectores de color:
| Selector | Controla |
|---|---|
| **BG** | Color de fondo |
| **CD** | Color de acento de la cuenta atrás |
| **TM** | Color de acento del cronómetro |

---

## 18. Registro de decisiones
El registro de decisiones proporciona un seguimiento estructurado de las decisiones tomadas durante operaciones o ejercicios.

### Crear una decisión
1. Haga clic en **+ Nueva decisión**
2. Complete título, descripción, estado y responsable
3. Adjunte archivos si es necesario
4. Haga clic en **Guardar**

### Estados de decisión
| Estado | Descripción |
|---|---|
| **Propuesta** | La decisión ha sido presentada |
| **Aprobada** | La decisión ha sido aprobada |
| **Rechazada** | La decisión ha sido rechazada |

---

## 19. Libro de registro
El libro de registro proporciona un registro cronológico de eventos operativos, observaciones y notas.
- Abra **Libro de registro** desde el panel lateral (pestaña Registros)
- Haga clic en **+ Nueva entrada** para añadir una entrada de registro
- Las entradas tienen marca de tiempo y están vinculadas al creador

---

## 20. Gestión de recursos
Gestione recursos operativos (salas, edificios, servicios TI, centros de datos) desde el panel lateral.

### Tipos de recurso
| Tipo | Descripción |
|---|---|
| **Sala** | Salas de reuniones, centros de operaciones |
| **Edificio** | Edificios e instalaciones físicas |
| **Servicio TI** | Infraestructura TI, servidores, redes |
| **Centro de datos** | Instalaciones de centros de datos |

### Crear un recurso
1. Abra la pestaña **Recursos** en el panel lateral
2. Seleccione el tipo de recurso
3. Haga clic en **+ Añadir**
4. Complete nombre, descripción, ubicación (lat/lng), imagen y símbolo
5. Haga clic en **Guardar**

---

## 21. Proyección de mapa
La proyección de mapa proporciona una vista geográfica interactiva de reuniones, usuarios y recursos.

- **Capas de mapa** — alterne entre OpenStreetMap, Topográfico, Satélite y Oscuro
- **Superposición de recursos** — mostrar/ocultar salas, edificios, servicios TI y centros de datos
- **Búsqueda de direcciones** — geocodifique una dirección y haga zoom a la ubicación
- **Selector de símbolos** — elija símbolos militares y operativos de mapa para recursos y eventos
- **Importación GeoJSON/KML** — cargue archivos de datos geográficos externos
- **Ajustar todos** — zoom automático para mostrar todos los marcadores visibles

---

## 22. Ventanas desprendibles
Varias vistas pueden desprenderse en ventanas de navegador separadas:
| Ventana | Descripción |
|---|---|
| **Relojes** | Todos los relojes, cuentas atrás y cronómetros |
| **Panel lateral** | Panel lateral completo con todas las pestañas |
| **Registro de decisiones** | Vista del registro de decisiones |
| **Proyección de mapa** | Mapa interactivo con todas las superposiciones |

El tema, idioma y datos se sincronizan automáticamente mediante BroadcastChannel.

---

## 23. Integraciones y conectores

### Marco de integraciones
La pestaña de Integraciones (Admin/Jefe de operaciones) proporciona:
- **OIDC SSO** — configuración de inicio de sesión único
- **SMTP correo** — correo electrónico saliente para alarmas e informes
- **Microsoft Teams** — integración webhook
- **Zoom** — integración de enlaces de reunión
- **Claves API** — generar tokens bearer

### Conectores de eventos
| Conector | Descripción |
|---|---|
| **STIX/TAXII** | Importar fuentes de inteligencia de ciberamenazas |
| **Syslog** | Recibir mensajes syslog como eventos |

---

## 24. Plantillas
Guarde y reutilice conjuntos de eventos, fases, bloqueos, grupos y capas:
- **Guardar** — seleccione rango de fechas; los eventos se almacenan con offsets relativos
- **Aplicar** — especifique STARTEX/T=0; todos los eventos se recrean; se soportan capas por evento
- **Importar** — cargue archivos de plantilla `.json`
- Se incluyen 31 plantillas de ejemplo: 20 plantillas de ejercicio y 11 plantillas de incidentes

---

## 25. Atajos de teclado y ratón

### Ratón

| Acción | Resultado |
|---|---|
| Clic en una franja horaria vacía | Abrir Añadir evento en ese momento |
| Clic en bloque de evento | Abrir detalles del evento |
| Arrastrar bloque de evento | Reprogramar a la franja de destino |
| Arrastrar columna de tiempo | Zoom de altura de franja (arriba = acercar) |
| Doble clic en columna de tiempo | Restablecer zoom a 1× |
| Clic central-arrastrar línea de tiempo | Desplazamiento horizontal |

### Teclado

| Tecla | Acción |
|---|---|
| `←` / `→` | Navegar atrás / adelante un intervalo |
| `T` | Saltar al día de hoy |
| `N` | Desplazar a la hora actual |
| `E` | Abrir diálogo de Añadir evento |
| `?` o `H` | Abrir ayuda integrada |
| `Esc` | Cerrar modal actual |
| `+` / `-` | Acercar/alejar altura de franja |
| `F` | Congelar / reanudar tiempo sintético |

---

## 26. Solución de problemas

### No puedo iniciar sesión
- Verifique el nombre de usuario y la contraseña (por defecto: `admin` / `admin`)
- Asegúrese de que el servidor está en ejecución: `./tidslinjal --port 8080`
- Revise el registro del servidor en busca de errores

### Los eventos no aparecen
- Verifique el intervalo de fechas de **Vista** — puede estar visualizando un intervalo que no incluye sus eventos
- Verifique los filtros de **Capas** — haga clic en 🗂 y asegúrese de que las capas correctas están activas
- Verifique la **Visibilidad de tipos de evento** en Configuración — los tipos ocultos no se muestran

### La alarma no se activa
- SSE requiere una conexión de navegador persistente — asegúrese de que la página está abierta
- Verifique que las notificaciones del navegador están permitidas para el sitio
- Verifique el tiempo de anticipación de la alarma: a 0 min la alarma se activa exactamente a la hora de inicio del evento

### La alternancia de capas no funciona
- Haga clic en **🗂 Capas** en la barra de herramientas
- Seleccione **Línea maestra** para ver todas las capas
- O seleccione capas individuales para filtrar

### La exportación genera un archivo vacío
- Asegúrese de que hay eventos en el intervalo de vista actual
- Ajuste el intervalo de **Vista** para incluir los eventos deseados

### El directorio de datos no es escribible
- Asegúrese de que el directorio `data/` existe y es escribible por el proceso del servidor
- Use `--data /ruta/a/directorio/escribible` o establezca la variable de entorno `DATA_DIR`

---

## 27. Referencias y biblioteca de documentos

La biblioteca de referencias permite gestionar documentos y enlaces vinculados a operaciones y ejercicios.

### Subir referencias

Suba referencias como archivo, URL o texto local. El sistema soporta subida masiva (varios archivos simultáneamente) y detección automática del tipo de archivo.

### Metadatos de referencia

Cada referencia tiene los siguientes metadatos:

| Campo | Descripción |
|---|---|
| **Título** | Nombre de la referencia |
| **Descripción** | Breve resumen |
| **Categoría** | Clasificación (ver abajo) |
| **Etiquetas** | Etiquetas de texto libre para búsqueda |
| **Idioma** | Idioma del documento |
| **Propietario** | Persona responsable |
| **Custodio** | Persona que mantiene el documento |
| **Modo de copia** | Cómo se almacena el documento (ver abajo) |

### Categorías

| Categoría |
|---|
| Manual |
| SOP |
| Política |
| Mapa |
| Referencia |
| Lista de verificación |
| FAQ |
| Objetivo |
| Otros |

### Modos de copia

| Modo | Descripción |
|---|---|
| **Copia central** | El archivo se almacena centralmente en el servidor |
| **Copia local** | El archivo se almacena localmente en el equipo del usuario |
| **Ver enlace** | Sin copia — solo un enlace a la fuente original |

### Editar metadatos de referencia

Haga clic en una referencia para abrir la vista de detalle. Haga clic en **Editar** para modificar los metadatos.

### Sumas de verificación criptográficas

El sistema calcula automáticamente sumas de verificación criptográficas para los archivos subidos:

| Algoritmo |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Haga clic en **Ver sumas de verificación** para abrir el modal de sumas de verificación con todos los valores calculados.

### Búsqueda y filtrado

Use el campo de búsqueda y los filtros de categoría para encontrar referencias. Filtre por categoría, etiquetas y texto libre.

---

## 28. Accesibilidad

### Modo de alto contraste

El modo de alto contraste puede aplicarse sobre cualquier tema y mejora la visibilidad de:
- Líneas de cuadrícula
- Marcadores de tiempo
- Bandas de fase
- Superposiciones de bloqueo
- Eventos resaltados

Active mediante **Configuración → Tema y visualización → Modo de alto contraste**.

### Paletas para daltonismo

Tres paletas para daltonismo están disponibles:

| Paleta | Tipo |
|---|---|
| **Protanopía** | Daltonismo rojo-verde |
| **Deuteranopía** | Daltonismo verde-rojo |
| **Tritanopía** | Daltonismo azul-amarillo |

Active mediante **Configuración → Tema y visualización → Paleta para daltonismo**.

El modo de alto contraste y las paletas para daltonismo pueden activarse simultáneamente.

---

## 29. Preajustes del espacio de trabajo

Guarde y restaure preajustes de espacio de trabajo con nombre para acceso rápido a sus vistas más frecuentes.

### Guardar un preajuste

Un preajuste guarda las siguientes configuraciones:
- Vista (cuadrícula, lista, libro de registro, decisiones, mapa, informes)
- Intervalo
- Resolución
- Nivel de zoom
- Capas ocultas
- Pestaña del panel lateral

### Cargar un preajuste

Haga clic en un preajuste guardado para aplicar inmediatamente todas las configuraciones guardadas con un solo clic.

### Eliminar un preajuste

Haga clic en **Eliminar** junto a un preajuste para borrarlo.

---

## Capacidades operativas

**Capacidades** (🎯 en Recursos) representan capacidades operativas que pueden ser rastreadas. Cada capacidad tiene:
- **Nombre** — el nombre de la capacidad
- **Zona** — ubicación geográfica/área opcional
- **Descripción** — descripción en texto libre
- **Propiedad** — quién posee/opera esta capacidad
- **Estado** — Operativo, Degradado, Inactivo o Desconocido

Las capacidades son **objetos reactivos**: cuando están vinculadas a una entrada del Key Terrain Board, los cambios en el nombre, zona, estado, propiedad y propietario de la capacidad se propagan automáticamente al tablero.

---

## Mejoras del Key Terrain Board (v8.2.0)

- **Columna Nº sec.** — número único asignado automáticamente por entrada
- **Columna Zona** — campo de texto ordenable para clasificación de área
- **Etiquetas de estado personalizables** — cambiar "Operativo" a "Normal", etc. en Configuración
- **Visibilidad de columnas** — mostrar/ocultar cualquier columna, incluyendo la columna de Gestión
- **Orden de columnas** — reordenar columnas directamente en el panel de Configuración
- **Panel Gestionar y Exportar** — Historial, Versiones, Imprimir y Exportar consolidados bajo un solo botón
- **Cargar desde Capacidad** — rellenar los campos de la entrada desde un recurso de capacidad existente

## Mejoras del Key Terrain Board (v8.3.0)

- **Columna Propietario** — muestra el propietario de cada capacidad vinculada; oculta por defecto (activar mediante Visibilidad de columnas); ordenable
- **Campo Propietario en capacidades** — nuevo campo "Propietario" en el formulario de recurso de capacidad, separado de Propiedad/Responsable; sincronizado automáticamente con las entradas del Key Terrain Board
- **Filtro de casillas de capacidad** — casillas de verificación para todos los nombres de capacidad en las entradas, complementando la búsqueda de texto existente
- **Filtro de casillas de prioridad** — casillas de verificación para valores 0–10, complementando la entrada numérica
- **Filtro de casillas de estado** — casillas de verificación para Operativo/Degradado/Inactivo/Desconocido, complementando el desplegable
- **Filtro de casillas de tendencia** — casillas de verificación para Mejorando/Estable/Empeorando, complementando el desplegable
- Todos los filtros de casillas están desmarcados por defecto; los valores marcados filtran como O dentro de un grupo, Y entre grupos

---

*Tidslinjal v8.3.0 — Línea de tiempo operativa colaborativa*
