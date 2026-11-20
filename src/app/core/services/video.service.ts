import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Video, Progress } from '../models/video.model';
import { Tag } from '../models/tag.model';
import { interval } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiUrl;
  private readonly apiUrl = environment.apiUrl + '/api/videos';

  getVideos(params: any): Observable<Video[]> {
    return this.http.get<Video[]>(this.apiUrl, { params });
  }

  getVideoById(id: string): Observable<Video> {
    return this.http.get<Video>(`${this.apiUrl}/${id}`);
  }

  deleteVideo(id: string): Observable<any> {
    return this.http.delete(this.apiUrl, { body: { video_id: id } });
  }

  editVideo(id: string, title: string, description: string): Observable<Video> {
    return this.http.patch<Video>(`${this.apiUrl}/${id}`, { title, description });
  }

  getVideoProgress(id: string): Observable<Progress> {
    // キャッシュを防ぐためにクエリパラメータにタイムスタンプを追加
    return this.http.get<Progress>(`${this.apiUrl}/${id}/progress?t=${new Date().getTime()}`);
  }

  incrementViewCount(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/views`, {});
  }

  createVideo(title: string, description: string, content_type: string): Observable<Video> {
    return this.http.post<Video>(this.apiUrl, { title, description, content_type });
  }

  uploadExVideo(title: string, description: string, url: string, channelId: string, delay: number): Observable<Video> {
    return this.http.post<Video>(`${this.apiBaseUrl}/api/ex-videos`, { title, description, url, channelId, delay });
  }

  getVideoTags(id: string): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.apiUrl}/${id}/tags`);
  }

  addVideoTag(videoId: string, tagName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${videoId}/tags`, { tag: tagName });
  }

  removeVideoTag(videoId: string, tag: Tag): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${videoId}/tags`, { body: { tag_id: tag.tag_id } });
  }

  pollUploadProgress(videoId: string, intervalMs: number = 500): Observable<any> {
    return interval(intervalMs).pipe(
      switchMap(() => this.getVideoProgress(videoId)),
      // completedまたはfailedのステータスが返るまでポーリングを続ける
      takeWhile((res) => res.status !== 2 && res.status !== 3, true),
    );
  }

  getLikes(videoId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/${videoId}/likes`);
  }

  addLike(videoId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${videoId}/likes`, {});
  }

  removeLike(videoId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${videoId}/likes`, {});
  }
}
