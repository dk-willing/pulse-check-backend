**Deliverable:** A **Sequence Diagram**.

### 1.0 User Signup & JWT Issuance

```mermaid
sequenceDiagram
    actor Client
    participant Express as Express App<br/>(app.js)
    participant Router as userRouter<br/>(userRoutes.js)
    participant Auth as authController<br/>(signup)
    participant UserModel as User Model<br/>(Mongoose)
    participant MongoDB

    Client->>Express: POST /api/v1/users/signup<br/>{name, email, password, passwordConfirm, role}
    Express->>Express: express.json() – parse body
    Express->>Router: route match /signup
    Router->>Auth: signup(req, res, next) via catchAsync
    Auth->>UserModel: User.create({name, email, password, passwordConfirm, role})
    UserModel->>UserModel: pre('save') hook – bcrypt.hash(password, 12)
    UserModel->>UserModel: pre('save') hook – passwordConfirm = undefined
    UserModel->>MongoDB: insertOne({name, email, hashedPassword, role})
    MongoDB-->>UserModel: user document
    UserModel-->>Auth: user
    Auth->>Auth: signToken(user._id)<br/>jwt.sign({id}, JWT_SECRET_KEY, {expiresIn})
    Auth-->>Client: 201 Created<br/>{status: "success", token, data: {name, role}}
```

### 1.1 Register Monitor (Admin-Protected)

```mermaid
sequenceDiagram
    actor Admin as Admin Client
    participant Express as Express App<br/>(app.js)
    participant Protect as auth.protect<br/>(JWT Verification)
    participant RBAC as auth.restrictedTo<br/>("admin")
    participant MC as monitorController<br/>(registerMonitor)
    participant MonitorModel as Monitor Model<br/>(Mongoose)
    participant MongoDB
    participant Timer as Node.js setTimeout

    Admin->>Express: POST /api/v1/monitors<br/>Authorization: Bearer #lt;token#gt;<br/>{name, timeout, alert_email}
    Express->>Express: express.json() – parse body

    rect rgb(255, 245, 235)
        Note over Protect: Authentication Layer
        Express->>Protect: protect(req, res, next)
        Protect->>Protect: Extract token from<br/>req.headers.authorization.split(" ")[1]
        alt No token present
            Protect-->>Admin: 401 {message: "No auth token found..."}
        end
        Protect->>Protect: jwt.verify(token, JWT_SECRET_KEY) → decoded {id, iat}
        Protect->>MongoDB: User.findOne({_id: decoded.id})
        MongoDB-->>Protect: user document
        alt No user found
            Protect-->>Admin: 400 {message: "No user found!..."}
        end
        Protect->>Protect: user.changedPasswordAfter(decoded.iat)
        alt Password changed after token issued
            Protect-->>Admin: 400 {message: "User changed password after token..."}
        end
        Protect->>Protect: req.user = user
    end

    rect rgb(235, 245, 255)
        Note over RBAC: Authorization Layer
        Protect->>RBAC: next() → restrictedTo("admin")
        RBAC->>RBAC: Check req.user.role ∈ ["admin"]
        alt Role not authorized
            RBAC-->>Admin: 403 {message: "You do not have permission..."}
        end
    end

    RBAC->>MC: next() → registerMonitor(req, res, next)
    MC->>MonitorModel: Monitor.create({name, timeout, alert_email})
    MonitorModel->>MongoDB: insertOne
    MongoDB-->>MonitorModel: monitor document
    MonitorModel-->>MC: monitor

    rect rgb(235, 255, 235)
        Note over MC,Timer: Timer Initialization — createTimer(monitor)
        MC->>Timer: setTimeout(alertCallback, timeout × 1000 + 1000)
        MC->>MC: monitor.expiresAt = Date.now() + timeout × 1000
        MC->>MongoDB: monitor.save() – persist expiresAt
    end

    MC-->>Admin: 201 Created<br/>{status: "success", data: {monitor}}
```

### 1.2 Device Heartbeat (Timer Reset)

```mermaid
sequenceDiagram
    actor Device as Remote Device<br/>(deviceSimulator)
    participant Express as Express App<br/>(app.js)
    participant MC as monitorController<br/>(sendHeartbeat)
    participant MonitorModel as Monitor Model<br/>(Mongoose)
    participant MongoDB
    participant Timer as Node.js setTimeout

    loop Every N seconds (setInterval in device.js)
        Device->>Express: POST /api/v1/monitors/:id/heartbeat
        Express->>MC: sendHeartbeat(req, res, next) via catchAsync

        MC->>MonitorModel: Monitor.findOne({_id: req.params.id})
        MonitorModel->>MongoDB: findOne
        MongoDB-->>MonitorModel: monitor document (or null)
        MonitorModel-->>MC: monitor

        alt monitor not found
            Note over MC: TODO: error response not yet implemented
        end

        rect rgb(235, 255, 235)
            Note over MC,Timer: createTimer(monitor) – Reset Countdown
            MC->>Timer: clearTimeout(monitor.timer) – cancel existing timer
            MC->>Timer: setTimeout(alertCallback, timeout × 1000 + 1000) – new timer
            MC->>MC: monitor.expiresAt = Date.now() + timeout × 1000
            MC->>MongoDB: monitor.save() – persist new expiresAt
        end

        MC-->>Device: 200 OK<br/>{status: "success", message: "Timer reset successful"}
    end
```

### 1.3 Timer Expiry → Alert & Email Notification

```mermaid
sequenceDiagram
    participant Timer as Node.js setTimeout
    participant MC as createTimer callback<br/>(monitorController.js)
    participant Console as console.log
    participant Email as sendEmail<br/>(lib/sendEmail.js)
    participant Nodemailer as Nodemailer<br/>transporter
    participant SMTP as SMTP Server<br/>(EMAIL_HOST)

    Note over Timer: timeout × 1000 + 1000 ms elapsed<br/>with no heartbeat received

    Timer->>MC: Callback fires
    MC->>MC: Check monitor.pause === false

    alt monitor.pause is true (paused)
        Note over MC: No action – alert suppressed
    else monitor.pause is false (active)
        MC->>Console: log {ALERT: "Device – <name> is down",<br/>OccuredAt: ISO timestamp,<br/>EmailSentTo: "<alert_email>"}

        MC->>Email: sendEmail({to, subject, message})
        Email->>Nodemailer: createTransport({host, port, auth})
        Email->>Nodemailer: sendMail({from: "CritMon Servers Inc.",<br/>to: alert_email,<br/>subject: 'Device "<name>" is down',<br/>text: "<name> – connection lost..."})
        Nodemailer->>SMTP: Deliver email
        SMTP-->>Nodemailer: Delivery confirmation
        Nodemailer-->>Email: Success
    end
```

### 1.4 Pause & Restart Monitor

```mermaid
sequenceDiagram
    actor Tech as Technician Client
    participant Express as Express App<br/>(app.js)
    participant MC as monitorController
    participant MonitorModel as Monitor Model<br/>(Mongoose)
    participant MongoDB
    participant Timer as Node.js setTimeout

    Note over Tech,Timer: Pause Flow – suppress alerts during maintenance

    Tech->>Express: POST /api/v1/monitors/:id/pause
    Express->>MC: pauseMonitor(req, res, next) via catchAsync
    MC->>MonitorModel: Monitor.findOne({_id: req.params.id})
    MonitorModel->>MongoDB: findOne
    MongoDB-->>MonitorModel: monitor document
    MonitorModel-->>MC: monitor
    MC->>MC: monitor.pause = true
    MC->>MongoDB: monitor.save()
    MC-->>Tech: 200 OK {status: "paused", message: "A technician paused this monitor"}

    Note over Tech,Timer: Restart Flow – resume monitoring

    Tech->>Express: POST /api/v1/monitors/:id/restart
    Express->>MC: restartMonitor(req, res, next) via catchAsync
    MC->>MonitorModel: Monitor.findOne({_id: req.params.id})
    MonitorModel->>MongoDB: findOne
    MongoDB-->>MonitorModel: monitor document
    MonitorModel-->>MC: monitor
    MC->>MC: monitor.pause = false

    rect rgb(235, 255, 235)
        Note over MC,Timer: createTimer(monitor) – Reset & Resume
        MC->>Timer: clearTimeout(monitor.timer)
        MC->>Timer: setTimeout(alertCallback, timeout × 1000 + 1000)
        MC->>MC: monitor.expiresAt = Date.now() + timeout × 1000
        MC->>MongoDB: monitor.save()
    end

    MC-->>Tech: 200 OK {status: "sucess", message: "Monitor started successfully",<br/>data: {monitor}}
```

### 1.5 Global Error Handling Pipeline

```mermaid
sequenceDiagram
    actor Client
    participant Express as Express App
    participant CatchAsync as catchAsync<br/>(lib/catchAsync.js)
    participant Handler as Route Handler
    participant AppError as AppError<br/>(lib/error.js)
    participant ErrCtrl as errorController<br/>(controllers/errorController.js)

    Client->>Express: Any API Request

    alt Route matches a defined endpoint
        Express->>CatchAsync: wrappedHandler(req, res, next)
        CatchAsync->>Handler: fn(req, res, next)

        alt Handler throws or rejects
            Handler-->>CatchAsync: Promise.reject(error)
            CatchAsync->>Express: .catch(next) → next(error)
            Express->>ErrCtrl: errorController(err, req, res, next)
        end
    else Route not found
        Express->>Express: app.use(/(.*)/)<br/>catch-all middleware
        Express->>AppError: new AppError("Can't find <url>...", 404)
        Express->>ErrCtrl: next(appError)
    end

    alt NODE_ENV === "development"
        ErrCtrl-->>Client: err.statusCode<br/>{status, message, error, errorStack}
    else NODE_ENV === "production"
        ErrCtrl-->>Client: err.statusCode<br/>{status, message}
    end
```

## The User Model

The user model helps the company add new users to the platform and secure access to protected routes.
It enforces required identity fields and handles password safety on save.

**Required fields**

- `name` (string): Required user display name.
- `email` (string): Required and validated as a proper email address.
- `password` (string): Required, minimum length 8 characters, stored as a bcrypt hash.
- `passwordConfirm` (string): Must match `password` during signup.

**Optional fields**

- `role` (string): One of `adminstrator`, `technician`, or `engineer` (defaults to `adminstrator`).
- `passwordChangedAt` (date): Used to invalidate JWTs after a password change.

**Model behavior**

- Before saving, the password is hashed with bcrypt and `passwordConfirm` is removed from storage.
- `changedPasswordAfter()` checks if a token was issued before the most recent password change.
- `correctPassword()` compares a candidate password to the stored hash during login.

---

## Authentication

Authentication and authorization logic lives in [controller/authController.js](controller/authController.js).

**Endpoints**

- `POST /api/v1/users/signup` creates a user and returns a JWT.
- `POST /api/v1/users/login` validates credentials and returns a JWT.

**JWT handling**

- When a user is signing up the user must provide `name, email, password and passwordConfirm` (this is deleted after the password is encrypted, and should match the password field during signup) and an optional `role` field which defaults to `administrator` when no role is provided during signup`

- Tokens are created with `signToken(id)` using `JWT_SECRET_KEY` and `JWT_EXPIRES_IN`.
- Clients must send `Authorization: Bearer <token>` for protected routes.

**Middleware**

- `protect` verifies the bearer token, loads the user, and checks `changedPasswordAfter`, if password was changed after the token was issued, the user is asked to login again.
- `restrictedTo(...roles)` enforces role-based access (used after `protect`).

**Notes**

- Login selects the password hash (`.select("+password")`) to verify credentials, since by default the password is set to `select: false`.
- Errors are forwarded to the `Global Error Handler` through `AppError` where applicable.

**Missing Features**

- This could be improved to allow user's change their password
- Also, featires like `change my details` for specific user can be implemented to allow user's update fields like wrongly spelt names or emails

---

## Middleware Overview

This project uses a small set of middleware functions to parse requests, guard routes, and centralize error handling. Most of them are registered in [app.js](app.js) and the auth guards live in [controller/authController.js](controller/authController.js).

**Request and logging middleware**

- `express.json()` parses JSON request bodies so handlers can access `req.body`.
- `morgan("dev")` logs requests in development mode when `NODE_ENV` is set to `development`.

**Routing middleware**

- `app.use("/api/v1/users", userRouter)` mounts the user routes defined in [routes/userRoutes.js](routes/userRoutes.js).

**Auth middleware**

- `protect` verifies JWTs, loads the user record, and blocks requests without a valid token.
- `restrictedTo(...roles)` enforces role-based access after `protect` has attached `req.user`.

**Global error handling**

- `app.use(/(.*)/, ...)` is a catch-all that creates a 404 when no route matches and forwards the error with `next(...)`.
- [controller/errorController.js](controller/errorController.js) is the final error-handling middleware. It formats error responses differently for `development` vs `production`, returning stack traces only in development.

- Asynchronous errors like `failed Database Connection` are handled gracefully so that our app does not crash. This is done by using `process.on(`unhandledRejection`)` this catches all possible skipped errors that results from asynchronous functions that wasn't well handled
- Similarly, synchronous errors like trying to access undefined variables are handled gracefully, however these errors should really crash our apps so as to be attended to immediately. These errors are handled using `process.on(`uncaughtException`)`.
