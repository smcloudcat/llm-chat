const hljs = require('highlight.js');
const code = "<?php echo 'Hello World'; ?>";
try {
    const result = hljs.highlight('php', code, { ignoreIllegals: true });
    console.log("Highlighted Code:", result.value);
} catch (error) {
    console.error("Error during highlighting:", error);
}
