import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TraQChannel } from '../models/traQchannel.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  uploadToMinio(presignedUrl: string, file: File): Observable<HttpEvent<any>> {
    return this.http.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
      reportProgress: true,
      observe: 'events',
    });
  }

  getTraQChannels(): Observable<TraQChannel[]> {
    return this.http
      .get<TraQChannel[] | null>(`${this.apiUrl}/traq-api/channels`)
      .pipe(map((resp) => resp ?? []));
  }
}
