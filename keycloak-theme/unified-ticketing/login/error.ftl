<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <link rel="stylesheet" type="text/css" href="${url.resourcesPath}/css/style.css">
</head>
<body>
    <div class="error-container">
        <img src="resources/img/logo.png" alt="Logo">
        <h2>Something went wrong</h2>
        <p>${message! "Unknown error occurred."}</p>
        <a href="${url.loginUrl}">Go back to login</a>
    </div>
</body>
</html>
