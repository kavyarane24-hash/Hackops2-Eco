# Services Architecture Guidelines
> **Member 3 – Intelligence Engine** | HackOps 2.0

All intelligence services must remain **strictly independent** of HTTP frameworks and Express `req`/`res` objects.

### Design Principles:
1. **Pure Input/Output**: Every service function accepts raw data (e.g. `text`, `buffer`, `filePath`, `options`) and returns a plain JavaScript object.
2. **Framework Decoupling**: Never import or accept `req`, `res`, or `next` inside `services/`.
3. **Multi-Consumer Support**:
   - `controllers/intelligence.controller.js` calls these services to serve `/api/intelligence/*`.
   - Other teammates (e.g., `controllers/complaints.controller.js`) can import and invoke these services in-process without making unnecessary HTTP calls.
   - Test suites and CLI scripts can invoke services directly.
4. **Data Separation**:
   Output structures must maintain distinct boundaries:
   - `citizenReported`: Unmodified citizen inputs.
   - `measuredData`: Verified sensor/data values (never invented or imputed).
   - `aiInference`: AI hypotheses, translations, and explanations (with explicit evidence references and disclaimers).
5. **Predictable Errors**: Throw standard JavaScript `Error` objects with a `.code` property for domain failures rather than sending HTTP status codes directly.

