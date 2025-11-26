<!DOCTYPE html>
<html>
<head>
    <title>Update Password</title>
    <link rel="stylesheet" type="text/css" href="${url.resourcesPath}/css/style.css">
</head>
<body>
    <div class="login-container">
        <img src="resources/img/logo.png" alt="Logo">
        <h2>Update Your Password</h2>
        <form id="kc-form-login" action="${url.loginAction}" method="post">
            <input type="password" name="password" placeholder="New Password" required>
            <input type="password" name="password-confirm" placeholder="Confirm Password" required>
            <button type="submit">Update Password</button>
        </form>
        <#if message??>
            <p class="error">${message}</p>
        </#if>
    </div>
</body>
</html>
