try {
  var savedTheme = localStorage.getItem("si-pilot.theme");
  if (savedTheme === "light" || savedTheme === "modern" || savedTheme === "dark") {
    document.documentElement.dataset.theme = savedTheme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content =
        savedTheme === "dark" ? "#090e0d" : savedTheme === "modern" ? "#eef3f7" : "#f3efe7";
    }
  }
} catch (error) {
  document.documentElement.dataset.theme = "dark";
}
