# البروتوكول (JSON عبر WebSocket)

أول رسالة من أي طرف بعد الاتصال: `{"token": "..."}` (توكن المستخدم للهاتف `/ws/phone`، وتوكن الجهاز للوكيل `/ws/agent`).

## الهاتف → الخادم
| type | حقول | المعنى |
|---|---|---|
| `command` | task_id, text | أمر عربي → تخطيط → تنفيذ |
| `analyze_screen` | task_id, text? | لقطة واحدة + تحليل (بطلبك فقط) |
| `screenshot` | task_id | لقطة واحدة بلا تحليل |
| `share_start` | task_id, max_seconds | بدء البث |
| `share_stop` | | إيقاف البث |
| `cancel` | task_id | إيقاف المهمة |
| `confirm` | task_id, approve | جواب طلب التأكيد |
| `ping` | | إبقاء الاتصال (صغير) |

## الخادم → الهاتف
`pc_status{online}` · `stage{stage,total}` · `progress{step,total,note}` · `clarify{question}` · `confirm_request{action,detail}` · `screenshot{jpeg,analysis}` · `frame{jpeg}` · `share_started` · `share_stopped` · `task_done{summary}` · `task_failed{error}` · `task_cancelled`

## الخادم → الوكيل
`task{task_id,plan}` · `capture_once` · `share_start{fps,max_seconds}` · `share_stop` · `cancel` · `confirm{approve}` · `stop_all{reason}` · `hb` (كل 15 ثانية)

## الوكيل → الخادم
`progress` · `confirm_request` · `screenshot{jpeg}` · `frame{jpeg}` · `share_started/stopped` · `task_done/failed/cancelled` · `ping`

## إجراءات الخطة (قائمة بيضاء)
`open_app{name}` `open_url{url}` `open_path{path}` `search_files{query,root?}` `focus_window{title}` `type_text{text,window?}` `press_keys{keys,window?}` `click_element{name,window?}` `set_field{name,text,window?}` `close_app{window}` `wait{seconds}` `list_windows` `delete_path{path}`⚠️تأكيد `verify_screen`

## REST
`POST /auth/register|login` · `POST /devices/pair-code` (توكن مستخدم) · `POST /devices/pair {code,name}` · `GET /devices` · `DELETE /devices/{id}`
