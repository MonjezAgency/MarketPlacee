const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YmFhODAxMy0wM2RiLTQyNmQtODQwMC05MWM0NjBlYTk3OTUiLCJlbWFpbCI6IjdiZDAyMDI1QGdtYWlsLmNvbSIsInJvbGUiOiJBRE1JTiIsIm9uYm9hcmRpbmdDb21wbGV0ZWQiOmZhbHNlLCJpYXQiOjE3NzY0NzU2NjMsImV4cCI6MTc3NjU2MjA2M30.4K6MKb3VDgibwiSxsIe5iT3ImlEJX5U7VNY2dp_BnhE';

let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
while (base64.length % 4) {
  base64 += '=';
}
try {
  const payload = JSON.parse(atob(base64));
  console.log('Success:', payload);
} catch (e) {
  console.error('Crash:', e);
}
