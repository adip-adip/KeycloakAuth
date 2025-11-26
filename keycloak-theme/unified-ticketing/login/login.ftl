<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Unified Ticketing System - Login</title>
    <link rel="stylesheet" type="text/css" href="${url.resourcesPath}/css/style.css">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <img src="${url.resourcesPath}/img/logo.png" alt="UTS Logo" class="logo">
            <h1>Unified Ticketing System</h1>
            <form id="kc-form-login" action="${url.loginAction}" method="post">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input id="username" name="username" type="text" value="${username!}" autofocus />
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" />
                </div>
                <div class="form-actions">
                    <button type="submit">Login</button>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
